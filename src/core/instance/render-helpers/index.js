/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers (target: any) {
  // 渲染v-once节点
  target._o = markOnce
  target._n = toNumber
  target._s = toString

  // 渲染v-for列表节点
  target._l = renderList

  // 渲染<slot></slot>节点
  target._t = renderSlot
  
  // 检查值是否一致
  target._q = looseEqual
  // 检查与其值相等的索引
  target._i = looseIndexOf

  // 渲染静态树
  target._m = renderStatic

  // 加载filters资源
  target._f = resolveFilter

  // 检查keyCodes(键码值)
  target._k = checkKeyCodes

  // 合并v-bind="object"到vnode的data属性上
  target._b = bindObjectProps

  // 创建文本vnode节点
  target._v = createTextVNode

  // 创建空白vnode节点
  target._e = createEmptyVNode

  // 解析scopedSlots属性
  target._u = resolveScopedSlots

  // 绑定事件监听属性
  target._g = bindObjectListeners

  // 绑定v-on上的动态属性key
  target._d = bindDynamicKeys

  // 动态添加修饰符标记到事件名称
  target._p = prependModifier
}
