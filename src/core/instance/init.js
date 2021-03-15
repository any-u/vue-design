/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // uid, 用于标识组件实例
    vm._uid = uid++

    let startTag, endTag
   
    // 非生产环境、performance设为true，且mark函数存在
    // 此处用于性能检测使用
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // 避免被重复观测的标识
    vm._isVue = true

    // 合并options
    // options存在且为组件
    if (options && options._isComponent) {

      // 优化内部组件的实例化过程，因为动态合并options非常慢，而且没有内部组件的options需要被特殊处理
      // 1.指定组件$options原型
      // 2.把父组件的props、listeners等挂载到组件的options上，便于子组件调用
      initInternalComponent(vm, options)
    } else {

      // 合并属性
      // 把构造函数上的静态属性与options 合并到$options上
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }

   // 非正式环境用proxy代理$options上的属性
   // 正式环境直接通过对象来获取属性
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    // 缓存自身
    vm._self = vm

    // 初始化生命周期相关属性
    initLifecycle(vm)

    // 初始化事件相关属性
    initEvents(vm)

    // 初始化渲染相关属性
    initRender(vm)

    // 调用beforeCreate生命周期
    callHook(vm, 'beforeCreate')

    // 初始化inject相关属性
    // 在data/props前解析inject
    initInjections(vm) 

    // 初始化state相关属性
    initState(vm)

    // 初始化provide相关属性
    // 在data/props后解析provide
    initProvide(vm) 

    // 调用created生命周期
    callHook(vm, 'created')

    // 非生产环境、performance设为true，且mark函数存在
    // 此处用于性能检测使用，配合上文performance使用
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果$options上存在el，则调用$mount方法
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {

  // 把组件的$options的原型指向构造函数上的options
  // 实例$options - __proto__ -> 构造函数的options的prototype
  const opts = vm.$options = Object.create(vm.constructor.options)

  // 把父组件的相关属性挂载到子组件的$options上
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {

  // 取出构造函数上的options
  let options = Ctor.options
  
  // 如果存在父级
  if (Ctor.super) {
    // 追溯父级构造函数上的options
    const superOptions = resolveConstructorOptions(Ctor.super)
    
    // 取出构造函数上缓存superOptions,与superOptions对比
    // |> Vue.extend初始缓存superOptions
    // |> 默认Super指向Vue构造函数，倘若Vue默认options发生改变,
    // |> 则此处superOptions 即与 cachedSuperOptions 不一致
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {

      // superOptions发生改变，则需要解析新options
      Ctor.superOptions = superOptions

      // 检查是否存在任何后期修改或附加的options
      // 解析出发生改变的options
      // |> 通过Vue.extend拓展阶段中的sealedOptions与options对比，获取出改变的options
      const modifiedOptions = resolveModifiedOptions(Ctor)
      
      // 用modifiedOptions更新extendOptions属性
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }

      // 合并extendOptions与superOptions属性
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)

      // 缓存新的components[name]
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options

  // 源自Vue.extend拓展阶段, 等同于Ctor.options
  // 如果Ctor.options发生改变，则取出对应属性 
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
