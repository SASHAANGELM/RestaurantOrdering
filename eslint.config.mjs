import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.nx/**', '**/.angular/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'] },
  { files: ['**/*.ts', '**/*.mts'], extends: [js.configs.recommended, ...tseslint.configs.recommended] },
  {
    files: ['**/*.ts', '**/*.mts'],
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': ['error', {
        enforceBuildableLibDependency: true,
        allow: [],
        depConstraints: [
          { sourceTag: 'scope:frontend', onlyDependOnLibsWithTags: ['scope:shared'] },
          { sourceTag: 'scope:backend', onlyDependOnLibsWithTags: ['scope:shared'] },
          { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'], allowedExternalImports: ['zod', 'tslib', 'vitest', 'vitest/config'] },
          { sourceTag: 'scope:e2e', onlyDependOnLibsWithTags: ['scope:frontend', 'scope:shared'] }
        ]
      }]
    }
  },
  {
    files: ['apps/frontend/**/*.ts', 'libs/contracts/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: builtinModules.filter((name) => !name.startsWith('node:')),
        patterns: ['node:*', '**/backend/**', '**/db/**', 'better-sqlite3', 'drizzle-orm', 'drizzle-orm/*', 'express', 'socket.io']
      }]
    }
  },
  {
    files: ['apps/frontend/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates
  },
  {
    files: ['libs/contracts/src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: builtinModules.filter((name) => !name.startsWith('node:')),
        patterns: ['node:*', '**/backend/**', '**/db/**', '@angular/*', '@ngrx/*', 'express', 'better-sqlite3', 'drizzle-orm', 'drizzle-orm/*', 'socket.io', 'vitest', 'vitest/*']
      }]
    }
  },
  {
    files: ['apps/frontend/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility]
  }
);
