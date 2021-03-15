import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  // 非正式环境，且构造函数不是Vue,打印警告信息
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 调用_init方法，即Vue.prototype._init方法
  this._init(options)
}

// 初始化Vue.prototype._init方法
initMixin(Vue)

// 代理Vue.prototype.$data 与 Vue.prototype.$props
// 初始化Vue.prototype.$set、Vue.prototype.$delete与Vue.prototype.$watch方法
stateMixin(Vue)

// 初始化Vue.prototype.$on、Vue.prototype.$once与Vue.prototype.$off方法
eventsMixin(Vue)

// 初始化Vue.prototype._update、Vue.prototype.$forceUpdate与Vue.prototype.$destory方法
lifecycleMixin(Vue)

// 初始化渲染相关的API
// 1. 运行时可用方法， 如Vue.prototype._s = Object.prototype.toString
// 2.初始化Vue.prototype.$nextTick与Vue.prototype._render
renderMixin(Vue)

export default Vue
