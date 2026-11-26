# Nickname blocklist — master copy

This file is the **readable master** of the two nickname word lists. It is not shipped: the build
only copies `public/` and `src/` into `dist/`, and the lists live in the bundle as base64 blobs so
that package/platform scanners do not read a moderation blocklist as published content.

Edit the lists below, then regenerate the encoded copies:

```sh
node scripts/encode-blocklist.mjs
```

`tests/blocklist.test.ts` fails if this file and the encoded blobs in `src/net/blocklist.ts` ever
drift apart.

Matching rules (implemented in `src/net/nickname.ts`):

- Terms here are matched **anywhere** in the normalised handle: five characters or more and
  unambiguous, so they cannot sit inside an innocent word. The one deliberate four-letter
  exception is `porn`, whose longer forms (`pornhub`, …) are exactly what a handle filter must
  catch and which no ordinary name contains.
- `_` and other separators are stripped before matching, leet substitutions are folded
  (`sh1t` → `shit`), and runs of a repeated letter collapse (`fuuuck` → `fuck`).
- Handles are ASCII-only (`A–Z a–z 0–9 _`), so no CJK terms are listed: Chinese input is rejected
  at the charset step before the blocklist is consulted.

## BLOCKED_SUBSTRINGS

```text
nigger
nigga
faggot
retard
tranny
chink
wetback
whitepower
heilhitler
siegsheil
hitler
genocide
lynching
porn
hentai
onlyfans
blowjob
handjob
cumshot
bukkake
gangbang
pedophile
paedophile
lolicon
incest
bestiality
dildo
orgasm
penis
vagina
pussy
cocaine
cannabis
marijuana
ketamine
methamphetamine
ecstasy
fentanyl
casino
bet365
betway
1xbet
pokerstars
roulette
terrorist
jihadist
beheading
childporn
howtomakeabomb
makemeth
tiananmen
falungong
falun
xijinping
jinping
hongkongindependence
taiwanindependence
freetibet
xinjiangcamp
```

## BLOCKED_WHOLE

Short or ambiguous terms: these only block a handle that _is_ the word (plus an optional digit
suffix), so `Cass`, `Sussex` and `Grape` stay playable while `Ass`, `Sex` and `Rape` do not.

Four-letter words, and words that are the innocent prefix of a real name (`Spicy`, `Nazir`,
`Heroine`), belong here too: kept in the substring list they rejected whole families of ordinary
handles. The bare handle and its digit variants are still refused.

```text
fuck
fuk
phuck
fux
shit
bitch
bastard
cunt
dick
cock
twat
prick
slut
whore
skank
wanker
moron
idiot
sex
sexy
nude
nudes
anal
rape
raped
rapist
cum
boobs
tits
ass
anus
weed
meth
crack
coke
bet
bets
gamble
gambler
winnie
pooh
ccp
isis
kkk
kys
kill
killer
murder
murderer
pedo
kike
spic
nazi
heroin
mdma
```
