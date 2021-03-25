/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * 渲染<slot></slot>的运行时方法
 */
export function renderSlot (
  name: string,
  fallback: ?Array<VNode>,
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {

  // $从scopedSlots中取出对应的作用域渲染函数
  // 即取出作用域渲染函数，然后传入props，再生成节点
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    }
    nodes = scopedSlotFn(props) || fallback
  } else {
    // 非作用域渲染方式，则直接从$slots中取出节点
    nodes = this.$slots[name] || fallback
  }

  // 如果target存在，则调用createElement生成节点
  // 否则则返回nodes节点
  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
