import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

export default {
  input: 'src/core.ts',
  output: [
    {
      file: 'dist/storees.umd.js',
      format: 'umd',
      name: 'Storees',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: 'dist/storees.esm.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/storees.min.js',
      format: 'umd',
      name: 'Storees',
      exports: 'named',
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist/types',
    }),
  ],
}
