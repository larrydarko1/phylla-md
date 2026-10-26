import { knip } from '@larrydarko/lint-config/knip';

export default knip({
    entry: ['src/**/*.d.ts!'],
    project: ['src/**/*.{ts,vue}!', 'tests/**/*.ts', '*.{ts,mts,js}'],
    tags: ['-public'],
    ignoreDependencies: ['onnxruntime-node'],
});
