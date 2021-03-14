/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // 给Vue绑定全局配置对象config
  // 采用 get 方式，以防止被修改
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // 暴露一些公共方法API，但这些API仅作为Vue开发者使用，
  // Vue使用者欲使用，需了解清楚相关的风险点
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // 设置Vue全局方法
  // 这些方法只会绑定到Vue构造函数上，不会绑定到原型链上，无法继承
  // 类似类中静态方法
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // Vue2.6版本: 公开开放响应式API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  //</T> --> 此处仅用于修复VSCode类型提示，无实际意义(非Vue源码)

  // 给Vue绑定options属性,采用Object.create(null)方式
  // Object.create(null) 与 {} 对比 -> 前者不会添加原型链prototype信息，可在Chrome控制台测试
  Vue.options = Object.create(null)

  // ASSET_TYPES = ['component','directive', 'filter']
  ASSET_TYPES.forEach(type => {

    // 把components, directives, filters 绑定到 Vue.options 上
    Vue.options[type + 's'] = Object.create(null)
  })

  // weex 兼容性处理
  Vue.options._base = Vue

  // builtInComponents: keep-alive
  // 把keep-alive绑定到Vue.options.components上
  extend(Vue.options.components, builtInComponents)

  // 给Vue绑定Vue.use方法，用于安装Vue插件
  initUse(Vue)

  // 给Vue绑定Vue.mixin方法，全局混入API
  initMixin(Vue)

  // 给Vue绑定Vue.extend方法，Vue.extend API
  initExtend(Vue)

  // 给Vue绑定Vue.component、Vue.directive、Vue.filter API
  initAssetRegisters(Vue)
}
