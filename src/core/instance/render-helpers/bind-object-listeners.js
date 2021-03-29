/* @flow */

import { warn, extend, isPlainObject } from 'core/util/index'

/**
 * 绑定对象监听事件
 * |> 遍历值,分别添加到对象的on[<key>]属性上
 */
export function bindObjectListeners (data: any, value: any): VNodeData {
  if (value) {
    // 如果值非对象，打印⚠️信息
    if (!isPlainObject(value)) {
      process.env.NODE_ENV !== 'production' && warn(
        'v-on without argument expects an Object value',
        this
      )
    } else {

      // 获取data.on属性
      // 然后遍历value，把对象的属性添加到on属性
      const on = data.on = data.on ? extend({}, data.on) : {}
      for (const key in value) {
        const existing = on[key]
        const ours = value[key]
        on[key] = existing ? [].concat(existing, ours) : ours
      }
    }
  }
  return data
}
