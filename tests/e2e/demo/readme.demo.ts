import { $, browser } from '@wdio/globals';
import { Key } from 'webdriverio';
import { Recorder, rootRegion, setScene } from './recorder';

// ✨ README의 움직이는 예시(docs/images/demo-*.gif)를 만듭니다. `npm run demo:wsl`로 실행하세요.
// 데모 보관함(tests/e2e/demo/vault)에서 실제 플러그인을 조작하며 찍습니다.

const OUT = 'docs/images';
const NOTES = ['Daily note', 'Roadmap', 'Sprint plan', 'Bug list', 'Reading list', 'Paper notes', 'Draft', 'Ideas'];
const PROJECT = { name: 'Project', color: '#5A8EE6', notes: ['Roadmap', 'Sprint plan', 'Bug list'] };
const READING = { name: 'Reading', color: '#6CB86C', notes: ['Reading list', 'Paper notes'] };

// 💡 만든 GIF의 크기를 알려 줌 (README에 넣기 전에 너무 크지 않은지 보려고)
const report = (name: string, bytes: number) => process.stdout.write(`${name}: ${Math.round(bytes / 1024)} KB
`);
const label = (name: string) => $('.workspace-split.mod-root').$(`.tab-group-label*=${name}`);
const tabHeader = (title: string) => $(`.workspace-split.mod-root .workspace-tab-header[aria-label="${title}"]`);

describe('README demos', function () {
    before(async function () {
        // 💡 WebDriver의 창 크기 바꾸기는 옵시디언(Electron)에서 안 되어, 옵시디언 창 객체로 바꿈
        await browser.execute(() => (window as unknown as { electronWindow: { setSize(width: number, height: number): void } }).electronWindow.setSize(1220, 640));
        await browser.waitUntil(async () => (await browser.execute(() => window.innerWidth)) === 1220, { timeoutMsg: 'the window was not resized' });
    });

    it('drags groups by their labels', async function () {
        await setScene(NOTES, [PROJECT, READING]);
        const rec = new Recorder(await rootRegion(300));
        await rec.showCursor({ x: 700, y: 200 });
        await rec.frame(900);

        // 그룹을 맨 앞으로
        await rec.drag(label('Reading'), tabHeader('Daily note'), { x: 0.05, y: 0.5 }, 12);
        rec.hold(900);

        // 그룹을 편집 영역 오른쪽 끝에 놓아 화면 나누기
        await rec.drag(label('Project'), $('.workspace-split.mod-root .workspace-leaf.mod-active'), { x: 0.92, y: 0.25 }, 22);
        const dropped = rec.frames.length - 1;
        await rec.moveTo({ x: rec.cursor.x - 120, y: rec.cursor.y + 40 }, 6);
        rec.endAfter(dropped, 1700);
        report('demo-drag.gif', rec.save(`${OUT}/demo-drag.gif`));
    });

    it('hides a group and reopens it', async function () {
        await setScene(NOTES, [PROJECT, READING]);
        const rec = new Recorder(await rootRegion(470));
        await rec.showCursor({ x: 700, y: 300 });
        await rec.frame(900);

        // 라벨 우클릭 → 그룹 창 → 그룹 숨기기
        await rec.moveToElement(label('Reading'));
        await rec.pulse();
        rec.shorten(100);
        await label('Reading').click({ button: 'right' });
        await rec.frame(300);
        rec.hold(500);
        rec.shorten(100);
        const hide = $('.modal').$('button=Hide group');
        await rec.moveToElement(hide);
        await rec.pulse();
        rec.shorten(100);
        await hide.click();
        await rec.frame(300);
        await rec.moveTo({ x: 760, y: 330 }, 8);
        rec.hold(1200);

        // 명령 팔레트 → 숨은 그룹 다시 열기
        await rec.press([Key.Ctrl, 'p']);
        rec.shorten(100);
        await rec.type('reopen hidden');
        rec.hold(400);
        await rec.press(Key.Enter);
        await rec.type('Rea');
        rec.hold(400);
        await rec.press(Key.Enter);
        rec.endAfter(rec.frames.length - 1, 2280);
        report('demo-hide.gif', rec.save(`${OUT}/demo-hide.gif`));
    });

    it('changes the settings', async function () {
        const ARCHIVE = { name: 'Archive', color: '#E6955C', notes: ['Q3 review', 'Meeting notes'], hidden: true };
        await setScene([...NOTES.slice(0, 6), 'Q3 review', 'Meeting notes'], [PROJECT, READING, ARCHIVE]);
        const rec = new Recorder(await rootRegion(560), 1.4);
        await rec.showCursor({ x: 700, y: 300 });
        await rec.frame(900);

        await browser.executeObsidian(({ app }) => {
            const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
            setting.open();
            setting.openTabById('tab-groups');
        });
        await rec.frame(900);

        // 그룹 모양: 밑줄 → 클래식 (뒤의 탭 바가 바로 바뀜)
        const style = $('//div[contains(@class, "mod-settings")]//div[contains(concat(" ", @class, " "), " setting-item ")][.//div[text()="Group style"]]//select');
        await rec.choose(style, 'classic');
        rec.pauseFor(1000);

        // 숨은 그룹 다시 열기
        const reopen = $('.mod-settings').$('button=Reopen');
        await rec.scrollTo(reopen);
        rec.hold(500);
        await rec.click(reopen);
        rec.hold(1800);
        await browser.keys(Key.Escape);
        await rec.frame();
        rec.endAfter(rec.frames.length - 1, 500);
        report('demo-settings.gif', rec.save(`${OUT}/demo-settings.gif`));
    });
});
