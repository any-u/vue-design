/*
 * @Author: your name
 * @Date: 2021-03-12 16:59:12
 * @LastEditTime: 2021-03-12 16:59:13
 * @LastEditors: Please set LastEditors
 * @Description: In User Settings Edit
 * @FilePath: /vue-design/.babelrc.js
 */
const babelPresetFlowVue = {
  plugins: [
    require('@babel/plugin-proposal-class-properties'),
    // require('@babel/plugin-syntax-flow'), // not needed, included in transform-flow-strip-types
    require('@babel/plugin-transform-flow-strip-types')
  ]
}

module.exports = {
  presets: [
    require('@babel/preset-env'),
    // require('babel-preset-flow-vue')
    babelPresetFlowVue
  ],
  plugins: [
    require('babel-plugin-transform-vue-jsx'),
    require('@babel/plugin-syntax-dynamic-import')
  ],
  ignore: [
    'dist/*.js',
    'packages/**/*.js'
  ]
}
