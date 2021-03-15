/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * 每个实例的构造函数（包括Vue）都有一个唯一的cid, 
   * 这样可以创建原型继承的子构造函数，并且可以缓存它。
   */
  Vue.cid = 0
  let cid = 1

  /**
   * 类继承
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}

    // Super 父类  Sub 子类
    // Super缓存当前this，即Vue这个构造函数
    const Super = this

    // 缓存cid
    const SuperId = Super.cid

    // 取出缓存的构造函数
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 取出组件name，非生产环境校检组件name
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 新建子类构造函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 通过Object.create继承Super.prototype
    Sub.prototype = Object.create(Super.prototype)
    
    // 手动设置constructor
    Sub.prototype.constructor = Sub

    // 设置cid,自增
    Sub.cid = cid++
    
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super

    // 对于props和computed, 我们在拓展原型的拓展阶段会在Vue实例上定义代理getter
    // 这样避免为每个创建的实例调用Object.defineProperty
    // PS: 代理的作用，如props里设置一个foo的属性,正常使用应该是 [实例.props.foo]  -- 通过代理 --> [实例.foo]
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 允许进一步拓展，如extend、mixin、use
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // 创建资源注册器，以至于继承的类也有它们自己的私有资源
    // ASSET_TYPES = ['component', 'directive', 'filter']
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    
    // 启用递归自查找
    if (name) {
      Sub.options.components[name] = Sub
    }

    // 拓展阶段保留对父类options的引用
    // 实例化阶段我们可以检查父类options是否已经更新
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // 缓存构造函数
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  // 取出options上的props属性
  const props = Comp.options.props
  for (const key in props) {
    // 用proxy代理getter
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  // 取出options上的computed
  const computed = Comp.options.computed
  for (const key in computed) {
    // 用proxy代理getter
    defineComputed(Comp.prototype, key, computed[key])
  }
}
