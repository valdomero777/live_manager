/** Layer rule (spec section 14): dependencies always point inwards. */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'domain may only import domain and shared contracts types',
      severity: 'error',
      from: { path: '^apps/server/src/domain' },
      to: { path: '^apps/server/src/(application|infrastructure|interface|main)' },
    },
    {
      name: 'domain-no-frameworks',
      severity: 'error',
      from: { path: '^apps/server/src/domain' },
      to: { dependencyTypes: ['npm'], pathNot: 'node_modules/(@tiklive/contracts|zod)' },
    },
    {
      name: 'application-no-outer-layers',
      severity: 'error',
      from: { path: '^apps/server/src/application' },
      to: { path: '^apps/server/src/(infrastructure|interface|main)' },
    },
    {
      name: 'application-no-frameworks',
      severity: 'error',
      from: { path: '^apps/server/src/application' },
      to: { dependencyTypes: ['npm'], pathNot: 'node_modules/(@tiklive/contracts|zod)' },
    },
    {
      name: 'interface-no-infrastructure',
      severity: 'error',
      from: { path: '^apps/server/src/interface' },
      to: { path: '^apps/server/src/(infrastructure|main)' },
    },
    {
      name: 'tiktok-library-only-in-adapter',
      severity: 'error',
      from: { pathNot: '^apps/server/src/infrastructure/tiktok' },
      to: { path: 'node_modules/tiktok-live-connector' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.spec\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: require('node:path').join(__dirname, 'apps/server/tsconfig.json') },
    enhancedResolveOptions: { conditionNames: ['development', 'import', 'types', 'default'] },
  },
};
