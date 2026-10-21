import { birds } from '@/data/birds';
import { gear, GEAR_VERSION } from '@/data/gear';
import { SPRING_GOBBLER_HOURS } from '@/data/guide';
import { GUIDE_REGS_VERSION, regTopics } from '@/data/guideRegs';
import { REGS } from '@/data/regs';

// Pins the corrections from the PR #13 fact-check against the 2026-27 PGC digest.
const labels = (k: keyof typeof gear) => gear[k].map((g) => g.label).join(' | ');
const topic = (k: string) => regTopics.find((t) => t.key === k)!.points.join(' | ');
const bird = (k: string) => birds.find((b) => b.key === k)!;
const sundaysBetween = (a: string, b: string) => {
  let n = 0;
  for (let d = new Date(`${a}T12:00:00Z`); d <= new Date(`${b}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 0) n++;
  return n;
};

describe('PR #13 fact-check (2026-27 digest)', () => {
  it('versions bumped', () => {
    expect(GUIDE_REGS_VERSION).toBe(`${REGS.version}+guide.2`);
    expect(GEAR_VERSION).toBe('2026-27.2');
  });
  it('1. turkey: no orange required, not marked as a requirement', () => {
    const o = gear.turkey.find((g) => /orange/i.test(g.label))!;
    expect(o.label).toBe('No fluorescent orange required in either turkey season (strongly recommended)');
    expect(o.required).toBeFalsy();
    expect(topic('orange')).toMatch(/No fluorescent orange required in either turkey season/);
  });
  it('2. turkey arms: shotgun, muzzleloading shotgun or bow/crossbow only, both seasons', () => {
    expect(labels('turkey')).toMatch(/Both seasons: shotgun \(3-shell capacity\), muzzleloading shotgun, or bow or crossbow \(35 lb minimum draw\)/);
    expect(labels('turkey')).toMatch(/#4 lead, #2 steel or #4 other non-toxic/);
    expect(labels('turkey')).not.toMatch(/other legal sporting arm/);
  });
  it('3. woodcock uses the small-game orange rule', () => {
    expect(labels('woodcock')).toMatch(/250 sq in of fluorescent orange/);
    expect(labels('woodcock')).not.toMatch(/differ from small game/);
  });
  it('4. bobwhite: no limit, statewide except Letterkenny', () => {
    expect(bird('bobwhite').regsNote).toMatch(/^No limit\. Statewide Sept 1–Dec 24 and Dec 26, 2026–Mar 31, 2027\./);
    expect(bird('bobwhite').regsNote).toMatch(/Letterkenny/);
    expect(labels('bobwhite')).toMatch(/No limit.*Letterkenny/);
  });
  it('5. hens legal in all WMUs; Wild Pheasant Recovery Areas closed', () => {
    const la = bird('pheasant').lookAlikes.join(' | ');
    expect(la).toMatch(/Male and female pheasants may be taken in all WMUs/);
    expect(la).toMatch(/closed in Wild Pheasant Recovery Areas/);
    expect(la).not.toMatch(/hens are not legal/);
  });
  it('6. Sunday closure lists all migratory game birds; crows open', () => {
    expect(topic('sunday')).toMatch(/waterfowl, mourning doves and woodcock \(also snipe, rails, gallinules, brant\)/);
    expect(topic('sunday')).toMatch(/Crows/);
  });
  it('7. no unsupported SGL non-toxic list claim', () => {
    const all = regTopics.flatMap((t) => t.points).join(' ') + Object.values(gear).flat().map((g) => g.label).join(' ');
    expect(all).not.toMatch(/digest lists them|SGLs and managed dove fields require|SGL or field requires|fields that require it/);
    expect(topic('nontoxic')).toMatch(/Lead fine shot \(#4 lead or smaller\)/);
  });
  it('8. spring gobbler hours shown', () => {
    expect(SPRING_GOBBLER_HOURS).toMatch(/noon through May 15, then ½ hour before sunrise to ½ hour after sunset/);
  });
  it('9-11. pheasant permit, duck stamp age, dove orange', () => {
    expect(topic('licenses')).toMatch(/\$26\.97.*free permit.*signed and carried.*May 13, 2017/);
    expect(topic('licenses')).toMatch(/duck stamp for waterfowl hunters 16 and older/);
    expect(topic('orange')).toMatch(/Not required for doves or waterfowl/);
  });
  it('pheasant Sundays counted against digest p.7: 19 statewide + 2 junior', () => {
    expect(sundaysBetween('2026-10-10', '2026-10-18')).toBe(2);
    expect(sundaysBetween('2026-10-24', '2026-12-24') + sundaysBetween('2026-12-26', '2027-02-28')).toBe(19);
    expect(REGS.species.pheasant.sundayNote).toBe('Sundays open: 19 statewide Sundays plus 2 in the junior season.');
  });
});
