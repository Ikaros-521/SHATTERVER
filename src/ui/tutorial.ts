import type { AudioDirector } from '../audio/director';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../game/config';
import { MODIFIERS } from '../game/levels/definitions';
import { byId, el, hexCss } from './dom';

/**
 * The first-run tutorial: a short slide deck over the main menu that explains the goal, the
 * controls, the shield bar and how it takes hits, buffs, debuffs (level mutators) and crystals.
 *
 * It is a plain overlay, not one of the UI's screens: it never joins `ScreenId`, manages its own
 * visibility, and reports one `onClose` when it leaves — however it leaves. Skipping and finishing
 * count the same, so `Settings.tutorialSeen` is written exactly once per open. The menu entry
 * (「新手说明」) reopens it at any time without re-writing the flag.
 */

export interface TutorialPage {
  eyebrow: string;
  title: string;
  /** Trusted static HTML authored in this file — never user or network content. */
  html: string;
  /** Renders the level-mutator grid (from `MODIFIERS`) under the page text. */
  mutators?: boolean;
}

/** True on the very first launch of a fresh save. Veterans with runs on record are not interrupted. */
export function shouldAutoShow(settings: { tutorialSeen: boolean }, records: { runs: number }): boolean {
  return !settings.tutorialSeen && records.runs === 0;
}

/** The mutator tiles are built on demand: module load must stay DOM-free (headless tests import this file). */
function mutatorSection(): HTMLElement[] {
  return MODIFIERS.map((modifier) =>
    el(
      'div',
      { class: 'tut-mutator', style: `--c:${hexCss(modifier.color)}` },
      el('b', {}, modifier.name, el('span', { class: 'tut-mutator-en', text: modifier.en })),
      el('p', { text: modifier.desc }),
    ),
  );
}

/** The deck. Facts come from the tuning constants so the copy cannot drift from the simulation. */
export const TUTORIAL_PAGES: TutorialPage[] = [
  {
    eyebrow: 'TUTORIAL · 01',
    title: '欢迎来到碎界',
    html: `
      <p>《碎界》是一款<b>越打越离谱的肉鸽打砖块</b>：击碎每一关的砖块，一路把挡板和球养成你的离谱流派。</p>
      <p>闯关模式共 15 个扇区、3 个 BOSS；无尽模式没有终点，越往深走越难。</p>
      <p>下面几页一分钟就能翻完。赶时间也可以随时点<b>跳过</b>——之后随时能在主菜单的「新手说明」里回来看。</p>`,
  },
  {
    eyebrow: 'TUTORIAL · 02',
    title: '挡板与球',
    html: `
      <p>移动<b>鼠标或手指</b>控制挡板。球落到底部<b>不会丢失</b>，稍后会从挡板重新发射。</p>
      <p>用挡板的不同位置接球控制回弹角度：<b>边缘</b>打出大角度，<b>中心</b>垂直弹回。正中接球是<b>完美接球</b>，充能最多。</p>
      <p><b>超载</b>：击中砖块和接球都会为挡板充能。充满后按 <kbd>空格</kbd> 或点击屏幕下方的提示按钮，获得 ${OVERDRIVE_DURATION} 秒的伤害与速度爆发。</p>
      <p>电脑端随时可按 <kbd>P</kbd> 或 <kbd>Esc</kbd> 暂停。</p>`,
  },
  {
    eyebrow: 'TUTORIAL · 03',
    title: '护盾与受损',
    html: `
      <p>画面左上角那排发光小格就是你的<b>护盾</b>（生命值）：开局 ${MAX_HP_BASE} 格，部分强化能提高上限。</p>
      <p>护盾只从两个地方掉：</p>
      <ul>
        <li><b>警戒线</b>——砖墙一直在下沉，沉过底部红色警戒线的砖块被击碎，护盾 −1。</li>
        <li><b>弹幕</b>——炮台与 BOSS 会朝挡板发射弹幕。用挡板拦截即可，漏到底部护盾 −1。</li>
      </ul>
      <p>每次受损后有约 1 秒的缓冲，不会连续受损；但连击会清零，超载能量也会损失一部分。</p>
      <p>回复途径：击败 BOSS 护盾 +1；关卡内偶尔掉落红心，接住即回复 1 格。<b>护盾归零，本局结束。</b></p>`,
  },
  {
    eyebrow: 'TUTORIAL · 04',
    title: '三选一强化',
    html: `
      <p>每通过一关进行<b>三选一</b>，所选强化只在本局内生效，一层层叠成流派。目前共有 39 种强化、5 个稀有度：普通 → 稀有 → 史诗 → 传说 → 神话。</p>
      <p>强化分体系——球体 / 挡板 / 伤害 / 烈焰 / 极寒 / 雷霆 / 腐蚀 / 虚空 / 爆炸 / 激光 / 时空 / 贪婪 / 生存 / 超载。<b>同体系的强化更容易一起出现</b>。</p>
      <p><b>元素反应</b>：同时拥有两种元素强化（冰、火、雷、毒）会自动解锁组合效果，例如「冰 + 火」的融化。</p>
      <p><b>碎晶</b>：击碎砖块掉落碎晶 ◆，可以在三选一里「刷新」选项，也可以「跳过」换取碎晶攒着用。</p>`,
  },
  {
    eyebrow: 'TUTORIAL · 05',
    title: '关卡变异与阻碍',
    html: `
      <p>部分关卡开场会预告一条<b>变异</b>：整关的规则被改写，有的添乱，有的反而给甜头。</p>
      <p>更高的难度还会出现会<b>吞球的湮灭砖</b>；「深渊」难度每 16 秒还会抹掉一个多余的球。BOSS 战拖得越久越危险——超时进入<b>狂暴</b>后，弹幕更密更难拦。</p>`,
    mutators: true,
  },
  {
    eyebrow: 'TUTORIAL · 06',
    title: '准备就绪',
    html: `
      <p>前几关节奏轻松，先把接球手感找回来。构筑成型之后，画面会越来越热闹。</p>
      <p>想查强化细节和元素反应：主菜单 →<b>强化图鉴</b>，「玩法」标签里有同样的规则速览。</p>
      <p>设置里可以调整音量、画质与屏幕震动；本机帧率不足时，游戏会自动降档保流畅。</p>
      <p>准备好了？点右下角，开一局。</p>`,
  },
];

/**
 * Builds and owns the tutorial overlay. Constructed once by the UI; `open` may be called any
 * number of times (first run, or the menu entry later).
 */
export class Tutorial {
  private readonly root: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private page = 0;
  private open = false;
  /** Removes this overlay's own key handling when it closes. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      this.goto(this.page + (event.code === 'ArrowRight' ? 1 : -1));
    }
  };

  constructor(
    private readonly audio: AudioDirector,
    /** Called once per open, on any exit path. The UI uses it to mark the tutorial as seen. */
    private readonly onClose: () => void,
  ) {
    // The overlay's buttons are not on any `data-action` route, so they carry their own click ticks.
    this.prev = el('button', { class: 'btn btn-ghost', type: 'button', text: '上一步' });
    this.next = el('button', { class: 'btn', type: 'button' });
    this.prev.addEventListener('click', () => {
      this.audio.ui('uiClick');
      this.goto(this.page - 1);
    });
    this.next.addEventListener('click', () => {
      if (this.page >= TUTORIAL_PAGES.length - 1) this.close();
      else {
        this.audio.ui('uiClick');
        this.goto(this.page + 1);
      }
    });

    this.dots = el('div', { class: 'tut-dots', role: 'tablist', 'aria-label': '说明页' });
    this.body = el('div', { class: 'tut-body' });
    this.eyebrow = el('div', { class: 'eyebrow' });
    this.title = document.createElement('h2');

    this.root = el(
      'section',
      { class: 'screen tutorial', hidden: true },
      el(
        'div',
        { class: 'dialog dialog-tall tut-dialog' },
        el(
          'header',
          { class: 'dialog-head tut-head' },
          el(
            'div',
            {},
            this.eyebrow,
            this.title,
            el('p', { class: 'dialog-sub', text: '一分钟了解碎界的规则、护盾、强化与变异。' }),
          ),
          el('button', { class: 'btn btn-ghost btn-small tut-skip', type: 'button', text: '跳过' }),
        ),
        this.body,
        el(
          'footer',
          { class: 'dialog-foot tut-foot' },
          this.dots,
          el('div', { class: 'tut-nav' }, this.prev, this.next),
        ),
      ),
    );
    const skip = this.root.querySelector<HTMLButtonElement>('.tut-skip');
    skip?.addEventListener('click', () => this.close());
    this.dots.addEventListener('click', (event) => {
      const dot = (event.target as HTMLElement).closest<HTMLElement>('[data-page]');
      if (dot?.dataset.page) {
        this.audio.ui('uiClick');
        this.goto(Number(dot.dataset.page));
      }
    });
    byId('ui').append(this.root);
  }

  openTutorial(): void {
    if (this.open) return;
    this.open = true;
    this.goto(0);
    this.root.hidden = false;
    document.addEventListener('keydown', this.onKey);
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    this.audio.ui('uiClick');
    this.onClose();
  }

  private goto(page: number): void {
    this.page = Math.max(0, Math.min(TUTORIAL_PAGES.length - 1, page));
    const current = TUTORIAL_PAGES[this.page];
    this.eyebrow.textContent = current.eyebrow;
    this.title.textContent = current.title;
    this.body.replaceChildren();
    this.body.insertAdjacentHTML('beforeend', current.html);
    if (current.mutators) this.body.append(el('div', { class: 'tut-grid' }, ...mutatorSection()));
    this.body.scrollTop = 0;

    this.prev.disabled = this.page === 0;
    this.next.textContent = this.page >= TUTORIAL_PAGES.length - 1 ? '开始游戏' : '下一步';
    this.dots.replaceChildren(
      ...TUTORIAL_PAGES.map((_, i) =>
        el('button', {
          class: `tut-dot${i === this.page ? ' on' : ''}`,
          type: 'button',
          'data-page': String(i),
          'aria-label': `第 ${i + 1} 页`,
        }),
      ),
    );
  }
}
