/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender (vm: Component) {

  // 初始化组件的_vnode属性
  vm._vnode = null // 子树的根
  vm._staticTrees = null // v-once 缓存树

  // 初始化获取vm.$options
  const options = vm.$options

  // 初始化获取父级vnode
  const parentVnode = vm.$vnode = options._parentVnode 

  // 获取渲染context
  const renderContext = parentVnode && parentVnode.context
  
  // 解析slot属性并赋给$slots
  vm.$slots = resolveSlots(options._renderChildren, renderContext)

  // 默认设置$scopedSlots为冻结的空对象(Object.freeze({}))
  vm.$scopedSlots = emptyObject

  // 把createElement函数绑定到vm._c上
  // 参数顺序: tag, data, children, normalizationType, alwaysNormalize
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  
  // 规范化的版本应用于用户编写的渲染函数，即alwaysNormalize设为true
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  const parentData = parentVnode && parentVnode.data

  // 把$attrs、$listeners定义为响应式数据，
  // 非生产环境新增setter警告，不允许直接修改$attrs、$listeners属性
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  Vue.prototype._render = function (): VNode {
    const vm: Component = this

    // 取出$options上的render函数和父级vnode
    // |> vm是子组件时，才存在父级vnode
    const { render, _parentVnode } = vm.$options

    if (_parentVnode) {

      // 父级vnode存在，设置当前组件上的作用域插槽属性$scopedSlots
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // 设置父级vnode，允许渲染函数有能力访问占位节点上的data
    vm.$vnode = _parentVnode
    
    // 渲染它自己
    let vnode
    try {
      // 无需维护堆栈，因为所有渲染函数都分开调用，当父组件被patch时，嵌套调用组件的渲染函数
      currentRenderingInstance = vm
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)

      // 返回错误的渲染结果，或者返回之前的vnode，以防渲染错误导致空白组件
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }

    // 如果返回的结果是单一接电脑的数组，则允许它
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }

    // 如果渲染函数出错，则返回空的vnode
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }

    // 设置父级节点
    vnode.parent = _parentVnode
    return vnode
  }
}
