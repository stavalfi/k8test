module.exports = {
  ...require('../../.eslintrc.js'),
  globals: {
    ...require('../../.eslintrc.js').globals,
    APP_ID: true,
  },
}
