/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {

    // Vue构造函数静态属性(不会直接继承)_installedPlugins初始化
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // 处理附加参数
    const args = toArray(arguments, 1)
    args.unshift(this)

    // 插件plugin类型检测
    // install是不是函数, 是则调用install
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)

      // plugin.install 不存在或非函数，
      // 直接检测plugin是不是函数，是则直接调用plugin
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }

    installedPlugins.push(plugin)
    return this
  }
}
