/* @flow */

import { isObject, isDef, hasSymbol } from 'core/util/index'

/**
 * 渲染v-for的运行时方法
 */
export function renderList (
  val: any,
  render: (
    val: any,
    keyOrIndex: string | number,
    index?: number
  ) => VNode
): ?Array<VNode> {
  let ret: ?Array<VNode>, i, l, keys, key

  // 如果值是数组或字符串
  // |> 遍历渲染数组或字符串
  // |> 数组 v-for="item of [1,2,3]" 或 v-for="item of list"
  // |> 这两种形式到此处时，都会被转成数组
  // |> 字符串 v-for="item of 'list'" -> 此情况下为字符串
  if (Array.isArray(val) || typeof val === 'string') {
    ret = new Array(val.length)
    for (i = 0, l = val.length; i < l; i++) {
      ret[i] = render(val[i], i)
    }
  } else if (typeof val === 'number') {

    // 如果值是数字
    ret = new Array(val)
    for (i = 0; i < val; i++) {
      ret[i] = render(i + 1, i)
    }
  } else if (isObject(val)) {

    // 如果值是对象

    if (hasSymbol && val[Symbol.iterator]) {

      // 存在symbol, 且存在迭代器
      // |> 用迭代器方式获取渲染结果
      ret = []
      const iterator: Iterator<any> = val[Symbol.iterator]()
      let result = iterator.next()
      while (!result.done) {
        ret.push(render(result.value, ret.length))
        result = iterator.next()
      }
    } else {

      // 普通对象，用for-in方式获取渲染结果
      keys = Object.keys(val)
      ret = new Array(keys.length)
      for (i = 0, l = keys.length; i < l; i++) {
        key = keys[i]
        ret[i] = render(val[key], key, i)
      }
    }
  }
  if (!isDef(ret)) {
    ret = []
  }
  (ret: any)._isVList = true
  return ret
}
