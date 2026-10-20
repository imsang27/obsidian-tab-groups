import { browser, expect } from '@wdio/globals';
import { addToGroup, createGroup, label, resetWorkspace, tab } from '../helpers';

// 💡 옵시디언을 다시 켜도 그룹이 그대로인지 (파일마다 옵시디언을 새로 켜므로 다른 테스트에 영향 없음)
describe('restore', function () {
    it('keeps groups after Obsidian restarts', async function () {
        await resetWorkspace();
        await createGroup('Alpha', 'Work');
        await addToGroup('Beta', 'Work');
        await label('Work').click();
        await browser.waitUntil(async () => (await tab('Alpha')).hidden);
        await browser.executeObsidian(async ({ app }) => {
            await (app.workspace as unknown as { saveLayout(): Promise<void> }).saveLayout();
        });

        await browser.reloadObsidian();

        await label('Work').waitForExist({ timeout: 20000 });
        await expect(label('Work')).toHaveElementClass('is-collapsed');
        const alpha = await tab('Alpha');
        const beta = await tab('Beta');
        expect(alpha.group).not.toBeNull();
        expect(beta.group).toBe(alpha.group);
        expect(alpha.hidden && beta.hidden).toBe(true);
    });
});
