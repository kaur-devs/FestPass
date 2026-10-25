export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'web',
        'worker',
        'db',
        'shared',
        'config',
        'auth',
        'events',
        'booking',
        'payments',
        'tickets',
        'realtime',
        'checkin',
        'ci',
        'deps',
      ],
    ],
  },
};
