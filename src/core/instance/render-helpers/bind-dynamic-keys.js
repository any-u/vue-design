/* @flow */

// helper to process dynamic keys for dynamic arguments in v-bind and v-on.
// For example, the following template:
//
// <div id="app" :[key]="value">
//
// compiles to the following:
//
// _c('div', { attrs: bindDynamicKeys({ "id": "app" }, [key, value]) })

import { warn } from 'core/util/debug'

/**
 * 绑定动态属性key值
 */
export function bindDynamicKeys (baseObj: Object, values: Array<any>): Object {
  // 遍历value上的key值，将其绑到baseObj上
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]
    // 
    if (typeof key === 'string' && key) {
      baseObj[values[i]] = values[i + 1]
    } else if (process.env.NODE_ENV !== 'production' && key !== '' && key !== null) {
      // 非生产环境且key不是空字符串且key不为null
      // |> null是用于显示删除绑定的特殊值
      warn(
        `Invalid value for dynamic directive argument (expected string or null): ${key}`,
        this
      )
    }
  }
  return baseObj
}

// 运行时动态添加修饰符标记到事件名称的助手
// |> 确保仅在value已经是字符串时追加，否则强制转换为string，并会导致类型检查丢失
export function prependModifier (value: any, symbol: string): any {
  return typeof value === 'string' ? symbol + value : value
}
