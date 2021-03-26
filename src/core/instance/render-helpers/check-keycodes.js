/* @flow */

import config from 'core/config'
import { hyphenate } from 'shared/util'

function isKeyNotMatch<T> (expect: T | Array<T>, actual: T): boolean {
  if (Array.isArray(expect)) {
    return expect.indexOf(actual) === -1
  } else {
    return expect !== actual
  }
}

/**
 * 检查配置中的keyCodes(键码值)的运行时方法
 * |> 暴露为Vue.prototype._k
 * 将eventKeyName作为倒数第二个参数进行传递，以实现向后兼容
 * |> 如<input v-on:keyup.enter="onClick">
 * |> eventKeyCode  -> 13
 * |> key -> 'enter'
 * |> builtInKeyCode -> 13
 * |> eventKeyName -> 'Enter'
 * |> builtInKeyName -> 'Enter'
 */
export function checkKeyCodes (
  eventKeyCode: number,
  key: string,
  builtInKeyCode?: number | Array<number>,
  eventKeyName?: string,
  builtInKeyName?: string | Array<string>
): ?boolean {
  const mappedKeyCode = config.keyCodes[key] || builtInKeyCode

  // 内建的键名存在，且事件键名存在，且配置中的keyCode不存在
  // 则通过事件键名和内建的键名判断是否匹配
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    
    // 匹配到相应的keyCode，则通过匹配的keyCode与事件keyCode对比
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {

    // 判断连字符事件名是否等于key值
    return hyphenate(eventKeyName) !== key
  }
}
