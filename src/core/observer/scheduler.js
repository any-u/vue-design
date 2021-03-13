/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

// 最大更新次数
// 用于检测无限更新时使用
export const MAX_UPDATE_COUNT = 100

// 观察者队列
const queue: Array<Watcher> = []

// 存储处于activated 阶段的 keep-alive 组件
const activatedChildren: Array<Component> = []

// 作为 id 唯一性对象
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}

// 防止 nextTick 重复执行
// flushing 保证不重复执行更新，waiting 保证不重复执行 nextTick
let waiting = false

// 是否正在执行更新
let flushing = false

// 用作队列长度
let index = 0

/**
 * 重置调度器状态
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * 更新观察者队列，并执行所有的观察者
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // 在更新前排序队列
  // 这样可以确保
  // 1. 组件先更新父级，再更新子级。因为父级总是在子级之前创建
  // 2. 用户在组件中定义的 watcher 在组件自身 render 观察者之前执行(因为用户的 watchers在组件 render 观察者之前创建)
  // 3. 如果某组件在父组件的观察者运行期间被销毁，那它的观察者可以被跳过
  queue.sort((a, b) => a.id - b.id)

  // 不缓存长度，因为当运行观察者时，可能有更多的观察者被推入队列
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run()
    // 非生产环境，检查并停止循环更新
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // 重置状态之前保留队列状态
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // 触发组件更新和 activated 生命周期钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // 浏览器 devtool 钩子函数
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * 在 patch 过程中，对处于 activated 阶段的 keep-alive 组件 进行排队
 */
export function queueActivatedComponent (vm: Component) {
  // 设置_inactive 为 false，这样render函数可以依赖于检查它是否在非活动树中(如: router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * 将观察者(watcher)放入到观察者(watcher)队列，具有重复id的被跳过，除非它是在队列flushed时被推送
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id

  // 具有重复id 的跳过
  if (has[id] == null) {
    has[id] = true

    // 队列没有执行
    // 为什么队列更新的时候，还存在观察者入队情况?
    // 计算属性(computed)，执行render函数更新时，当render存在computed时，会触发计算属性get，从而收集依赖
    if (!flushing) {

      // 观察者入队列
      queue.push(watcher)
    } else {

      // 如果已经正在执行更新，根据它的 id 插入观察者(watcher)。
      // 保证按id顺序插入, id的顺序代表观察者创建顺序，
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    // 按顺序执行
    if (!waiting) {
      waiting = true

      // 非正式环境，且同步
      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 用nextTick异步执行flushSchedulerQueue，触发观察者队列里所有观察者更新
      nextTick(flushSchedulerQueue)
    }
  }
}
