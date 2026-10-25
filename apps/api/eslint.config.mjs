// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        // `tsconfig.json` incluye `src/**/*` y `test/**/*`. Con `test/` fuera,
        // `projectService: true` no encontraba los e2e en ningún proyecto y
        // ESLint los reportaba como "not found by the project service": no se
        // analizaban, no se tipaban y sus errores quedaban invisibles.
        // Incluirlos en el tsconfig los mete en el proyecto con las MISMAS
        // opciones del compilador y, por tanto, con las MISMAS reglas tipadas.
        // No se desactiva ninguna regla ni se degrada el tipado.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // La regla SIGUE activa como `error`. `argsIgnorePattern` no la desactiva:
      // solo permite marcar con `_` un parámetro que se conserva por contrato
      // y que todavía no se consume. Es la convención ya presente en el
      // repositorio (`_data` en `current-user.decorator.ts`, `_o` en los
      // `@ValidateIf` de los DTO).
      //
      // `varsIgnorePattern` NO se toca a propósito: las variables y los
      // imports sin usar se siguen reportando y se corrigen de verdad.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
