// `npm run lint` catches the class of bug that froze the game on 29 Sept 2026:
// a variable used before it is defined (there, a local `a` shadowing the audio
// graph inside the alarm sound, which threw every frame once alarms started).
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
      'no-shadow': 'warn',
      'no-unused-vars': 'warn',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
];
