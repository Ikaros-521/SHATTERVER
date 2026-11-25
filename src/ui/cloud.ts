/**
 * The cloud leaderboard screen.
 *
 * Owns one DOM section and nothing else, so adding the leaderboard to the game did not mean
 * threading it through the existing screens. It leans on the styles the local records screen
 * already uses (`rank-row`, `rank-badge`, `rank-score`), which is what keeps the two boards
 * looking like one feature.
 *
 * Two things it must get right:
 * - **Show the name the server applied**, never the text in the box: a taken name comes back
 *   suffixed, and a new player's name is only held until their first score.
 * - **Stay readable when offline**, because that is a normal state for a browser game with a
 *   flaky connection — not an error worth alarming the player about.
 *
 * On the B站 Toy channel (`cloud.kind === 'toy'`) the nickname flow does not exist: identity is
 * the platform's B站 nickname — Chinese included, content-safety is the platform's — so the rename
 * row is hidden and the header copy says who the boards belong to.
 */

import type { AudioDirector } from '../audio/director';
import { formatNumber, formatScore } from '../core/math';
import type { BoardInfo } from '../net/cheddaboards';
import type { Leaderboard } from '../net/leaderboard';
import { NICKNAME_MAX, NICKNAME_MIN, checkNickname } from '../net/nickname';
import { byId, el, setText } from './dom';

type Tone = 'ok' | 'warn' | 'info';

export class CloudPanel {
  private boardId = 'all-time';
  private boards: BoardInfo[] = [];
  /** Bumped on every refresh, so a slow response for an old tab cannot overwrite a newer one. */
  private generation = 0;
  private busy = false;
  /** True on the B站 Toy channel, where the nickname UI is hidden and the platform names you. */
  private readonly toy: boolean;

  private readonly input = byId<HTMLInputElement>('cloud-nickname');
  private readonly saveButton = byId<HTMLButtonElement>('cloud-save-name');
  private readonly note = byId('cloud-name-note');
  private readonly tabs = byId('cloud-tabs');
  private readonly body = byId('cloud-body');
  private readonly foot = byId('cloud-foot');

  constructor(
    private readonly cloud: Leaderboard,
    private readonly audio: AudioDirector,
  ) {
    this.toy = cloud.kind === 'toy';
    if (this.toy) this.adaptToToy();
    this.saveButton.addEventListener('click', () => void this.saveNickname());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.saveNickname();
    });
    // Live validation, so the player learns the rule before pressing the button.
    this.input.addEventListener('input', () => {
      const raw = this.input.value.trim();
      if (raw.length === 0) {
        this.setNote(`云榜昵称需 ${NICKNAME_MIN}–${NICKNAME_MAX} 位英文字母、数字或下划线。`, 'info');
        return;
      }
      const check = checkNickname(raw);
      this.setNote(check.ok ? `可以使用「${check.value}」。` : check.message, check.ok ? 'ok' : 'warn');
    });
  }

  /** Opens the screen: refreshes everything it shows. */
  open(): void {
    this.audio.ui('uiClick');
    if (this.toy) {
      this.setNote('云榜显示你的B站昵称（支持中文），无需另外设置。', 'info');
      void this.primeNickname();
      void this.refresh();
      return;
    }
    this.input.value = this.cloud.nickname;
    this.input.maxLength = NICKNAME_MAX;
    if (this.cloud.nickname === '') {
      this.setNote(
        `还没有设置昵称。不设置的话，云榜会显示服务器自动分配的 Player_ 编号。只能使用 ${NICKNAME_MIN}–${NICKNAME_MAX} 位英文字母、数字或下划线。`,
        'info',
      );
    } else if (this.cloud.nicknamePending) {
      this.setNote(`「${this.cloud.nickname}」会在下一局成绩上传后出现在云榜上。`, 'info');
    } else {
      this.setNote(`当前昵称：${this.cloud.nickname}`, 'ok');
    }
    void this.refresh();
  }

  private setNote(text: string, tone: Tone): void {
    this.note.hidden = false;
    this.note.dataset.tone = tone;
    setText(this.note, text);
  }

  /**
   * On B站, swaps the screen's header copy and hides the rename row: the boards there belong to
   * the Toy platform and the player is named by their B站 account. Scoped to this screen's own
   * dialog, which this panel owns.
   */
  private adaptToToy(): void {
    const head = document.querySelector('#screen-cloud .dialog-head');
    const eyebrow = head?.querySelector<HTMLElement>('.eyebrow');
    const sub = head?.querySelector<HTMLElement>('.dialog-sub');
    if (eyebrow) setText(eyebrow, 'CLOUD · BILIBILI TOY');
    if (sub) {
      setText(
        sub,
        '成绩自动上传到B站排行榜：总榜 / 本周 / 今日，另有无尽、战役与深渊榜。 「全球榜」是 CheddaBoards 全球榜的只读镜像。',
      );
    }
    const row = this.input.closest<HTMLElement>('.cloud-name');
    if (row) row.hidden = true;
  }

  /**
   * Asks the platform for the B站 nickname, so the player's own row can be highlighted. Runs
   * inside the click that opened this screen — the user gesture the platform's first-use consent
   * dialog requires. After it resolves the board is re-read so the「你」chip appears; before it
   * does, the list simply shows no highlight, which is the whole cost of a refusal.
   */
  private async primeNickname(): Promise<void> {
    const name = (await this.cloud.loadNickname?.()) ?? null;
    if (!name) return;
    this.setNote(`云榜显示你的B站昵称：${name}`, 'ok');
    void this.refreshBody(++this.generation);
  }

  // ───────────────────────────── nickname ─────────────────────────────

  private async saveNickname(): Promise<void> {
    if (this.busy) return;
    const raw = this.input.value;
    const check = checkNickname(raw);
    if (!check.ok) {
      this.setNote(check.message, 'warn');
      this.audio.ui('deny');
      return;
    }
    this.busy = true;
    this.saveButton.disabled = true;
    this.setNote('正在保存…', 'info');
    const outcome = await this.cloud.rename(raw);
    this.busy = false;
    this.saveButton.disabled = false;
    // The server is the authority on the final spelling; show what it kept.
    this.input.value = outcome.nickname;
    this.setNote(outcome.message, outcome.ok ? 'ok' : 'warn');
    this.audio.ui(outcome.ok ? 'pick' : 'deny', outcome.ok ? 2 : undefined);
    if (outcome.ok) void this.refresh();
  }

  // ───────────────────────────── boards ─────────────────────────────

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.boards = await this.cloud.knownBoards();
    if (generation !== this.generation) return;
    if (!this.boards.some((board) => board.scoreboardId === this.boardId)) {
      this.boardId = this.boards[0]?.scoreboardId ?? 'all-time';
    }
    this.renderTabs();
    await this.refreshBody(generation);
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(
      ...this.boards.map((board) => {
        const tab = el('button', {
          class: 'tab',
          type: 'button',
          text: board.name,
          'aria-selected': String(board.scoreboardId === this.boardId),
        });
        tab.addEventListener('click', () => {
          if (this.boardId === board.scoreboardId) return;
          this.boardId = board.scoreboardId;
          this.audio.ui('uiClick');
          this.renderTabs();
          void this.refreshBody(++this.generation);
        });
        return tab;
      }),
    );
    // The fan-out trio always exists; anything beyond it is a board the operator created.
    this.tabs.dataset.mode = this.boards.length > 3 ? 'all' : 'fanout';
  }

  private async refreshBody(generation: number): Promise<void> {
    const boardId = this.boardId;
    this.body.replaceChildren(el('p', { class: 'cloud-empty', text: '读取中…' }));

    const [view, rank] = await Promise.all([
      // Read depth is the board's display cap: top 100 on every channel. The Toy platform's
      // backend caps reads at 100, so this is the largest number both services agree on.
      this.cloud.board(boardId, 100),
      boardId === 'all-time' ? this.cloud.myRank() : Promise.resolve(null),
    ]);
    if (generation !== this.generation || boardId !== this.boardId) return;

    this.foot.replaceChildren();
    if (!view) {
      this.body.replaceChildren(
        el('p', {
          class: 'cloud-empty',
          text: '连不上云榜。成绩和昵称都还在本机，网络恢复后打开这里再试。',
        }),
      );
      return;
    }

    const entries = view.entries ?? [];
    if (entries.length === 0) {
      this.body.replaceChildren(
        el('p', { class: 'cloud-empty', text: '这个榜还没有成绩。打一局，你就是第一条。' }),
      );
    } else {
      const mine = this.cloud.nickname;
      this.body.replaceChildren(
        ...entries.map((entry, index) => {
          const isMine = mine !== '' && entry.nickname === mine;
          const row = el(
            'div',
            { class: `rank-row cloud-row${index < 3 ? ` top${index + 1}` : ''}${isMine ? ' mine' : ''}` },
            el('div', { class: 'rank-badge', text: String(entry.rank).padStart(2, '0') }),
            el(
              'div',
              { class: 'rank-main' },
              el(
                'div',
                { class: 'rank-scoreline' },
                el('span', { class: 'rank-name', text: entry.nickname }),
                isMine ? el('span', { class: 'rank-chip new', text: '你' }) : null,
              ),
              el('div', {
                class: 'rank-meta',
                text: entry.streak > 0 ? `最高连击 ${formatNumber(entry.streak)}` : '',
              }),
            ),
            el('span', { class: 'rank-score', text: formatScore(entry.score) }),
          );
          row.style.animationDelay = `${Math.min(index, 12) * 35}ms`;
          return row;
        }),
      );
    }

    // The Toy platform does not report board totals, so the count is only shown when it is known;
    // a "共 N 条" that counted the visible slice would be a lie.
    const parts: string[] = [];
    if (typeof view.totalEntries === 'number') parts.push(`共 ${formatNumber(view.totalEntries)} 条`);
    if (rank) {
      parts.push(
        rank.totalPlayers > 0 ? `你排第 ${rank.rank} / ${rank.totalPlayers}` : `你排第 ${rank.rank}`,
      );
    }
    this.foot.append(el('span', { class: 'cloud-foot-text', text: parts.join(' · ') }));
  }
}
