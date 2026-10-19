import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 🧪 단위 테스트: 옵시디언 없이 돌릴 수 있는 순수 함수만 시험합니다. (npm test)
// 'obsidian' 패키지는 타입 정의뿐이라 실행할 코드가 없어서, 테스트에서는 대역(tests/obsidian-stub.ts)으로 바꿉니다.
export default defineConfig({
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
    },
});
