import { $, browser } from '@wdio/globals';
import gifenc from 'gifenc';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import type { WorkspaceLeaf } from 'obsidian';
import { Key } from 'webdriverio';

// 💡 README용 움직이는 예시를 만드는 도구: 화면에 가짜 커서를 그려 움직이고, 한 단계마다 스크린샷을 찍어 GIF로 묶습니다.
// 스크린샷은 실제 시간과 상관없이 찍히므로, 프레임마다 보여 줄 시간(delay)을 정해 둡니다.

export interface Point {
    x: number;
    y: number;
}

export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
}

type WdioElement = ReturnType<typeof $>;

// 💡 gifenc는 CommonJS 모듈이라 기본 내보내기에서 꺼냄
const { applyPalette, GIFEncoder, quantize } = gifenc;
const sleep = (ms: number) => browser.pause(ms);

// 💡 GIF 빠르기 기본값: 프레임마다 정한 시간에 곱함 (클수록 느림). 데모마다 Recorder에서 바꿀 수 있음
const PACE = 1.6;

export class Recorder {
    frames: { png: Buffer; delay: number }[] = [];
    cursor: Point = { x: 0, y: 0 };

    constructor(public region: Region, public pace = PACE) {}

    // 💡 지금 화면을 한 프레임으로 (delay: 이 프레임을 보여 줄 시간, ms)
    async frame(delay = 40) {
        await sleep(60); // 화면이 다 그려지도록 잠깐 기다림
        this.frames.push({ png: Buffer.from(await browser.takeScreenshot(), 'base64'), delay });
    }

    // 💡 마지막 프레임이 GIF에서 딱 ms 동안 보이게 함 (pace를 곱한 뒤의 시간)
    pauseFor(ms: number) {
        const last = this.frames[this.frames.length - 1];
        if (last) last.delay = ms / this.pace;
    }

    // 💡 마지막 행동 뒤 GIF가 끝나기까지의 시간을 ms로 맞춤 (pace를 곱한 뒤의 시간)
    // from: 마지막 행동 직후 찍은 프레임의 번호. 그 뒤 프레임들의 시간을 빼고 남은 만큼 마지막 프레임을 보여 줌
    endAfter(from: number, ms: number) {
        const last = this.frames[this.frames.length - 1];
        if (!last) return;
        // GIF는 0.01초 단위로 저장하므로 그 단위로 반올림해 더함
        const between = this.frames.slice(from, -1).reduce((sum, frame) => sum + Math.round(frame.delay * this.pace / 10) * 10, 0);
        last.delay = Math.max(0, (ms - between) / this.pace);
    }

    // 💡 마지막 프레임을 GIF에서 ms만큼 짧게 보여 줌 (pace를 곱한 뒤의 시간)
    shorten(ms: number) {
        const last = this.frames[this.frames.length - 1];
        if (last) last.delay = Math.max(0, last.delay - ms / this.pace);
    }

    // 💡 마지막 프레임을 더 오래 보여 줌
    hold(ms: number) {
        const last = this.frames[this.frames.length - 1];
        if (last) last.delay += ms;
    }

    async showCursor(at: Point) {
        this.cursor = at;
        await browser.execute((x: number, y: number) => {
            document.querySelectorAll('.demo-cursor').forEach(el => el.remove());
            const cursor = document.body.createDiv({ cls: 'demo-cursor' });
            const arrow = cursor.createSvg('svg', { attr: { width: 22, height: 26, viewBox: '0 0 22 26' } });
            arrow.createSvg('path', { attr: {
                d: 'M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.5 15 L17 15 Z', fill: 'white', stroke: 'black', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
            } });
            cursor.setCssStyles({ position: 'fixed', left: `${x - 2}px`, top: `${y - 2}px`, zIndex: '2147483647', pointerEvents: 'none' });
        }, at.x, at.y);
    }

    // 💡 커서를 부드럽게(처음과 끝은 천천히) 옮기며 프레임을 찍습니다. 끄는 중이면 onStep으로 dragover를 보냄
    async moveTo(to: Point, steps = 10, onStep?: (at: Point) => Promise<void>) {
        const from = this.cursor;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            const at = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
            await browser.execute((x: number, y: number) => {
                document.querySelector<HTMLElement>('.demo-cursor')?.setCssStyles({ left: `${x - 2}px`, top: `${y - 2}px` });
                document.querySelector<HTMLElement>('.demo-drag-image')?.setCssStyles({ left: `${x + 10}px`, top: `${y + 10}px` });
            }, at.x, at.y);
            this.cursor = at;
            if (onStep) await onStep(at);
            await this.frame(30);
        }
    }

    async moveToElement(el: WdioElement, at: Point = { x: 0.5, y: 0.5 }, steps = 10) {
        await this.moveTo(await pointIn(el, at), steps);
    }

    // 💡 el이 보이도록 감싼 스크롤 영역을 부드럽게 굴림 (화면 가운데쯤 오게)
    async scrollTo(el: WdioElement, steps = 10) {
        const distance = await browser.execute((target: HTMLElement) => {
            let box = target.parentElement;
            while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
            if (!box) return 0;
            (window as unknown as { demoScroll: HTMLElement }).demoScroll = box;
            const r = target.getBoundingClientRect(), b = box.getBoundingClientRect();
            return r.top + r.height / 2 - (b.top + b.height / 2);
        }, (await el.getElement()) as unknown as HTMLElement);
        for (let i = 1; i <= steps; i++) {
            await browser.execute((delta: number) => { (window as unknown as { demoScroll: HTMLElement }).demoScroll.scrollTop += delta; }, distance / steps);
            await this.frame(30);
        }
    }

    // 💡 누르는 순간을 작은 원으로 보여 줌
    async pulse() {
        await browser.execute((x: number, y: number) => {
            const ring = document.body.createDiv({ cls: 'demo-click' });
            ring.setCssStyles({
                position: 'fixed', left: `${x - 12}px`, top: `${y - 12}px`, width: '24px', height: '24px', borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.35)', zIndex: '2147483646', pointerEvents: 'none',
            });
        }, this.cursor.x, this.cursor.y);
        await this.frame(120);
        await browser.execute(() => document.querySelectorAll('.demo-click').forEach(el => el.remove()));
    }

    async click(el: WdioElement, options: { button?: 'left' | 'right' } = {}) {
        await this.moveToElement(el);
        await this.pulse();
        await el.click({ button: options.button ?? 'left' });
        await this.frame(300);
    }

    // 💡 드롭다운에서 고르는 모습. 운영체제가 그리는 목록은 스크린샷에 찍히지 않아, 옵시디언 메뉴 모양으로 목록을 그려 보여 줌
    async choose(select: WdioElement, value: string) {
        await this.moveToElement(select);
        await this.pulse();
        const target = await browser.execute((selectEl: HTMLSelectElement, value: string) => {
            const r = selectEl.getBoundingClientRect();
            const menu = document.body.createDiv({ cls: 'menu demo-dropdown' });
            menu.setCssStyles({ position: 'fixed', left: `${r.left}px`, top: `${r.bottom + 4}px`, minWidth: `${r.width}px`, zIndex: '2147483640' });
            let point = { x: 0, y: 0 };
            for (const option of Array.from(selectEl.options)) {
                const item = menu.createDiv({ cls: 'menu-item' });
                item.createDiv({ cls: 'menu-item-title', text: option.text });
                if (option.selected) item.addClass('selected');
                if (option.value === value) item.addClass('demo-target');
            }
            const t = menu.querySelector('.demo-target')!.getBoundingClientRect();
            point = { x: t.left + Math.min(40, t.width / 2), y: t.top + t.height / 2 };
            return point;
        }, (await select.getElement()) as unknown as HTMLSelectElement, value);
        await this.frame(500);
        await this.moveTo(target, 8);
        await browser.execute(() => {
            document.querySelectorAll('.demo-dropdown .menu-item').forEach(item => item.toggleClass('selected', item.hasClass('demo-target')));
        });
        await this.frame(400);
        await this.pulse();
        await browser.execute(() => document.querySelectorAll('.demo-dropdown').forEach(el => el.remove()));
        await select.selectByAttribute('value', value);
        await this.frame(300);
    }

    // 💡 입력란에 한 글자씩 쳐 넣는 모습
    async type(text: string) {
        for (const char of text) {
            await browser.keys(char);
            await this.frame(50);
        }
    }

    async press(key: string | string[]) {
        await browser.keys(key);
        await this.frame(300);
    }

    // 💡 source를 끌어 target의 at 지점에 놓습니다. (E2E의 dragTo와 같은 순서지만, 한 걸음마다 프레임을 찍음)
    // 끄는 동안 끄는 요소의 그림을 커서 옆에 띄워 실제 끌기처럼 보이게 합니다.
    async drag(source: WdioElement, target: WdioElement, at: Point, steps = 16) {
        await this.moveToElement(source);
        await this.pulse();
        await browser.execute((sourceEl: HTMLElement, x: number, y: number) => {
            const state = window as unknown as { demoDrag: { dataTransfer: DataTransfer; source: HTMLElement } };
            state.demoDrag = { dataTransfer: new DataTransfer(), source: sourceEl };
            const image = sourceEl.cloneNode(true) as HTMLElement;
            image.addClass('demo-drag-image');
            const r = sourceEl.getBoundingClientRect();
            image.setCssStyles({
                position: 'fixed', left: `${x + 10}px`, top: `${y + 10}px`, width: `${r.width}px`, height: `${r.height}px`,
                opacity: '0.75', zIndex: '2147483645', pointerEvents: 'none',
            });
            document.body.appendChild(image);
            const fire = (type: string, el: Element) => el.dispatchEvent(new DragEvent(type, {
                bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: state.demoDrag.dataTransfer,
            }));
            fire('dragstart', sourceEl);
            fire('dragover', sourceEl);
        }, (await source.getElement()) as unknown as HTMLElement, this.cursor.x, this.cursor.y);
        await sleep(50);

        // 💡 끌기 시작하면 탭 자리가 바뀌므로, 놓을 지점은 그 뒤 자리 표시를 뺀 배치로 잼 (tab-drag.ts의 is-measuring)
        const end = await browser.execute((targetEl: HTMLElement, ax: number, ay: number) => {
            const placeholder = document.querySelector('.tab-group-drag-placeholder');
            placeholder?.classList.add('is-measuring');
            const r = targetEl.getBoundingClientRect();
            placeholder?.classList.remove('is-measuring');
            return { x: r.left + r.width * ax, y: r.top + r.height * ay };
        }, (await target.getElement()) as unknown as HTMLElement, at.x, at.y);

        await this.moveTo(end, steps, async point => {
            await browser.execute((x: number, y: number) => {
                const { dataTransfer } = (window as unknown as { demoDrag: { dataTransfer: DataTransfer } }).demoDrag;
                document.elementFromPoint(x, y)?.dispatchEvent(new DragEvent('dragover', {
                    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer,
                }));
            }, point.x, point.y);
        });

        await browser.execute((x: number, y: number) => {
            const { dataTransfer, source } = (window as unknown as { demoDrag: { dataTransfer: DataTransfer; source: HTMLElement } }).demoDrag;
            const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer };
            (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new DragEvent('drop', init));
            source.dispatchEvent(new DragEvent('dragend', init));
            if (!source.isConnected) document.dispatchEvent(new DragEvent('dragend', init));
            document.querySelectorAll('.demo-drag-image').forEach(el => el.remove());
        }, this.cursor.x, this.cursor.y);
        await sleep(300);
        await this.frame(300);
    }

    // 💡 찍은 프레임을 region만큼 잘라 GIF로 저장합니다.
    // 색은 모든 프레임에 같은 255색을 쓰고, 앞 프레임과 같은 점은 투명하게 두어 파일을 작게 만듭니다.
    save(file: string) {
        const { x, y, width, height } = this.region;
        const crop = (png: Buffer) => {
            const image = PNG.sync.read(png);
            const out = new Uint8Array(width * height * 4);
            for (let row = 0; row < height; row++) {
                const start = ((y + row) * image.width + x) * 4;
                out.set(image.data.subarray(start, start + width * 4), row * width * 4);
            }
            return out;
        };
        const images = this.frames.map(frame => crop(frame.png));

        // 💡 팔레트는 프레임 몇 장을 이어 붙여 고름 (모든 프레임을 쓰면 느림)
        const sample = images.filter((_, i) => i % Math.max(1, Math.floor(images.length / 8)) === 0);
        const joined = new Uint8Array(sample.reduce((sum, image) => sum + image.length, 0));
        let offset = 0;
        for (const image of sample) {
            joined.set(image, offset);
            offset += image.length;
        }
        const palette = quantize(joined, 255);
        while (palette.length < 255) palette.push([0, 0, 0]);
        const transparentIndex = palette.length;
        palette.push([0, 0, 0]);

        const gif = GIFEncoder();
        let previous: Uint8Array | null = null;
        images.forEach((image, i) => {
            const index = applyPalette(image, palette);
            const shown = index.slice();
            if (previous) {
                for (let p = 0; p < index.length; p++) if (index[p] === previous[p]) shown[p] = transparentIndex;
            }
            gif.writeFrame(shown, width, height, {
                palette: i === 0 ? palette : undefined,
                delay: Math.round(this.frames[i]!.delay * this.pace / 10) * 10,
                transparent: previous !== null,
                transparentIndex,
                dispose: 1,
            });
            previous = index;
        });
        gif.finish();
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, gif.bytes());

        // 💡 확인용으로 멈춘 장면과 여덟 장마다 한 장을 PNG로도 남김 (docs/images/stills, git에는 안 올림)
        const stills = `${dirname(file)}/stills`;
        mkdirSync(stills, { recursive: true });
        const name = file.split('/').pop()!.replace('.gif', '');
        this.frames.forEach((frame, i) => {
            if (frame.delay < 300 && i % 8 !== 0) return;
            const png = new PNG({ width, height });
            png.data = Buffer.from(images[i]!);
            writeFileSync(`${stills}/${name}-${String(i).padStart(3, '0')}.png`, PNG.sync.write(png));
        });
        return gif.bytes().length;
    }

    async hideCursor() {
        await browser.execute(() => document.querySelectorAll('.demo-cursor, .demo-click, .demo-drag-image, .demo-dropdown').forEach(el => el.remove()));
    }
}

export async function pointIn(el: WdioElement, at: Point = { x: 0.5, y: 0.5 }): Promise<Point> {
    return browser.execute((target: HTMLElement, ax: number, ay: number) => {
        const r = target.getBoundingClientRect();
        return { x: r.left + r.width * ax, y: r.top + r.height * ay };
    }, (await el.getElement()) as unknown as HTMLElement, at.x, at.y);
}

// 💡 편집 영역(양옆 사이드바 제외)의 화면 위치. GIF는 이 영역을 위에서부터 height만큼 자릅니다.
export async function rootRegion(height: number): Promise<Region> {
    const r = await browser.execute(() => {
        const rect = document.querySelector('.workspace-split.mod-root')!.getBoundingClientRect();
        return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    return { ...r, height: Math.min(height, r.height) };
}

export interface DemoGroup {
    name: string;
    color: string;
    notes: string[];
    hidden?: boolean;
}

// 💡 사이드바를 접고 탭을 모두 닫은 뒤, 노트를 차례로 열고 그룹을 만듭니다. (끝나면 맨 앞 탭을 고름)
export async function setScene(notes: string[], groups: DemoGroup[], settings: Record<string, unknown> = {}) {
    while (await $('.modal-container').isExisting()) {
        await browser.keys(Key.Escape);
        await sleep(100);
    }
    await browser.executeObsidian(async ({ app, plugins }, notes, groups, settings) => {
        type Plugin = {
            groups: Map<string, unknown>;
            leafGroupMap: WeakMap<object, string>;
            settings: Record<string, unknown>;
            applyGroupStyle(): void;
            saveSettings(): Promise<void>;
            hideGroup(groupId: string): Promise<void>;
            enforcePhysicalSorting(): void;
        };
        const plugin = plugins.tabGroups as unknown as Plugin;
        const workspace = app.workspace;
        workspace.leftSplit.collapse();
        workspace.rightSplit.collapse();
        const leaves: WorkspaceLeaf[] = [];
        workspace.iterateAllLeaves(leaf => {
            const root = leaf.getRoot();
            if (root !== workspace.leftSplit && root !== workspace.rightSplit) leaves.push(leaf);
        });
        // 💡 탭 하나는 남겨 첫 노트를 엶 (탭을 다 닫으면 새 탭을 붙일 탭 묶음이 없음)
        const keep = leaves.shift();
        if (keep) plugin.leafGroupMap.delete(keep);
        leaves.forEach(leaf => leaf.detach());
        plugin.groups.clear();
        Object.assign(plugin.settings, { groupStyle: 'underline', labelTabCount: 'off', removeEmptyGroups: false, lockGroupedTabs: false, suggestGroupName: false, groupSets: [] }, settings);
        plugin.applyGroupStyle();

        const opened = new Map<string, object>();
        for (const [i, name] of notes.entries()) {
            const file = app.vault.getFileByPath(`${name}.md`);
            const leaf = i === 0 && keep ? keep : workspace.getLeaf('tab');
            if (file) await leaf.openFile(file);
            opened.set(name, leaf);
        }

        // 💡 창 버튼(최소화·닫기 등)은 데모에 필요 없어 숨김
        const hide = '.titlebar-button-container, .workspace-tab-header-container .sidebar-toggle-button.mod-right { display: none !important; }';
        if (!document.adoptedStyleSheets.some(sheet => sheet.cssRules[0]?.cssText.startsWith('.titlebar-button-container'))) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(hide);
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        }
        // 💡 그룹 ID는 장면마다 새로 (앞 장면의 그룹 순서를 이어받지 않게)
        const ids = groups.map((_, i) => `demo-${Date.now()}-${i}`);
        for (const [i, group] of groups.entries()) {
            const groupId = ids[i]!;
            plugin.groups.set(groupId, { name: group.name, color: group.color, leafIds: new Set(), isCollapsed: false, tabs: [] });
            for (const name of group.notes) {
                const leaf = opened.get(name);
                if (leaf) plugin.leafGroupMap.set(leaf, groupId);
            }
        }
        await plugin.saveSettings();
        plugin.enforcePhysicalSorting();
        for (const [i, group] of groups.entries()) if (group.hidden) await plugin.hideGroup(ids[i]!);
        const first = opened.get(notes[0]!);
        if (first) workspace.setActiveLeaf(first as never, { focus: true });
    }, notes, groups, settings);
    await sleep(500);
}
