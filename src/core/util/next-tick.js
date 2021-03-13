/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

// 存储任务
const callbacks = []

// 任务执行状态
let pending = false

// 执行所有任务
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// 异步函数包装器
let timerFunc

// Promise 存在，则采用 Promise 模式
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)

    // 兼容处理
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true

  // MutationObserver 存在，则采用 MutationObserver 模式
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true

  // setImmediate 存在，则采用 setImmediate 模式
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 回退到 setImmediate。从技术上讲，它虽然属于宏任务，但它还是比 setTimeout 好
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // 回退到 setTimeout
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  
  // callbacks 新增任务
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })

  // 不在执行阶段，则执行任务
  if (!pending) {
    pending = true
    timerFunc()
  }

  // 缓存resolve函数，避免任务意外中断
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
