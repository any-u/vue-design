/* @flow */

import { remove, isDef } from 'shared/util'

export default {
  create (_: any, vnode: VNodeWithData) {
    registerRef(vnode)
  },
  update (oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) {
      registerRef(oldVnode, true)
      registerRef(vnode)
    }
  },
  destroy (vnode: VNodeWithData) {
    registerRef(vnode, true)
  }
}

/**
 * 注册ref
 * |> 将vnode的组件实例(componentInstance) 或vnode的元素属性(elm)添加到vm.$refs中
 */
export function registerRef (vnode: VNodeWithData, isRemoval: ?boolean) {

  // 用key保存ref的值
  const key = vnode.data.ref
  if (!isDef(key)) return

  const vm = vnode.context
  const ref = vnode.componentInstance || vnode.elm
  const refs = vm.$refs

  // 如果是移除ref属性的情况
  // |> refs[key]是数组，则遍历数组设置ref属性
  // |> 如果refs[key]是ref，则直接设置undefined
  if (isRemoval) {
    if (Array.isArray(refs[key])) {
      remove(refs[key], ref)
    } else if (refs[key] === ref) {
      refs[key] = undefined
    }
  } else {

    // 判断是否在v-for下
    // |> 不是 -> 直接设置到ref中
    // |> 是  -> 数组，或非数组，2种情况做添加操作
    if (vnode.data.refInFor) {
      if (!Array.isArray(refs[key])) {
        refs[key] = [ref]
      } else if (refs[key].indexOf(ref) < 0) {
        // $flow-disable-line
        refs[key].push(ref)
      }
    } else {
      refs[key] = ref
    }
  }
}
