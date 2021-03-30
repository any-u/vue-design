/* @flow */

import { def } from 'core/util/lang'
import { normalizeChildren } from 'core/vdom/helpers/normalize-children'
import { emptyObject } from 'shared/util'

/**
 * 格式化作用域插槽
 */
export function normalizeScopedSlots (
  slots: { [key: string]: Function } | void,
  normalSlots: { [key: string]: Array<VNode> },
  prevSlots?: { [key: string]: Function } | void
): any {
  let res
  
  // hasNormalSlots -> 是否存在普通插槽
  const hasNormalSlots = Object.keys(normalSlots).length > 0

  // isStable -> 是否稳定
  // |> $stable -> 是否存在动态属性
  // |> hasNormalSlots -> 是否存在普通插槽
  const isStable = slots ? !!slots.$stable : !hasNormalSlots
  const key = slots && slots.$key
  if (!slots) {
    
    // slot不存在
    // |> 初始化为{}
    res = {}
  } else if (slots._normalized) {

    // 快速路径1： 仅重新渲染子组件，父组件未更改
    return slots._normalized
  } else if (
    isStable &&
    prevSlots &&
    prevSlots !== emptyObject &&
    key === prevSlots.$key &&
    !hasNormalSlots &&
    !prevSlots.$hasNormal
  ) {
    // 快速路径2: 稳定的作用域插槽，具有/没有用于代理的标准插槽，只需要标准化一次
    return prevSlots
  } else {
    res = {}
    for (const key in slots) {
      if (slots[key] && key[0] !== '$') {
        res[key] = normalizeScopedSlot(normalSlots, key, slots[key])
      }
    }
  }

  // 在作用域插槽上暴露普通插槽
  for (const key in normalSlots) {
    if (!(key in res)) {
      res[key] = proxyNormalSlot(normalSlots, key)
    }
  }

  // avoriaz似乎模拟了一个不可扩展的$ scopedSlots对象，当该对象向下传递时，将导致错误
  // avoriaz -> Vue测试库
  if (slots && Object.isExtensible(slots)) {
    (slots: any)._normalized = res
  }
  def(res, '$stable', isStable)
  def(res, '$key', key)
  def(res, '$hasNormal', hasNormalSlots)
  return res
}

function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    let res = arguments.length ? fn.apply(null, arguments) : fn({})
    res = res && typeof res === 'object' && !Array.isArray(res)
      ? [res] // single vnode
      : normalizeChildren(res)
    return res && (
      res.length === 0 ||
      (res.length === 1 && res[0].isComment) // #9658
    ) ? undefined
      : res
  }
  // 这是使用新语法的无作用域插槽，尽管它被编译为作用域插槽，但渲染函数(用户)希望它存在于this.$slots上。
  // 因为它的用法在语义上是正常的插槽
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  return normalized
}

function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
