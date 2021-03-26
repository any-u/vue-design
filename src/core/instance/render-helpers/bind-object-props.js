/* @flow */

import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate
} from 'core/util/index'

/**
 * 合并v-bind="object" 到vnode的data属性上的运行时方法
 */
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    // value非对象打印⚠️信息
    if (!isObject(value)) {
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      if (Array.isArray(value)) {
        // 如果value是一个对象数组 -> 即[{}]
        // 将其转成普通对象
        value = toObject(value)
      }
      let hash
      for (const key in value) {
        // 如果key是class或style或[key,ref,slot,slot-scope,is](保留属性)
        // |> 则hash 直接等于data
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) {
          hash = data
        } else {

          // 获取data的attrs的type值 -> type用作mustUseProp中
          // 判断是否是Prop或者必须作为Props的属性
          // |> 是则获取domProps
          // |> 否则获取data.attrs
          const type = data.attrs && data.attrs.type
          hash = asProp || config.mustUseProp(tag, type, key)
            ? data.domProps || (data.domProps = {})
            : data.attrs || (data.attrs = {})
        }

        // 驼峰形式
        const camelizedKey = camelize(key)

        // 连字符形式
        const hyphenatedKey = hyphenate(key)

        // 如果驼峰形式或连字符形式都不存在
        // 则设置hash[key]等于value[key]
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          hash[key] = value[key]

          // 是同步，则在on里添加属性的更新事件 
          if (isSync) {
            const on = data.on || (data.on = {})
            on[`update:${key}`] = function ($event) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
