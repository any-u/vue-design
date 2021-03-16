/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// cached缓存函数
// |> 缓存Id选择器 -> innerHtml
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 缓存Vue.prototype.$mount
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  // 非生产模式打印⚠️信息
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options

  // 解析template或el, 并转成render函数
  if (!options.render) {
    let template = options.template
    
    // 判断template是否存在
    if (template) {

      // template是字符串
      if (typeof template === 'string') {

        // 判断template第一个字符是否为#, 将被视作id选择器
        // |> 通过缓存的 [ID选择器 -> innerHTML] 获取innerHTML
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)

          // 非生产环境打印⚠️信息
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      
      // template是DOM节点，设置template等于DOM的innerHTML
      // |>nodeType 是DOM的API, 获取节点的类型
      } else if (template.nodeType) {
        template = template.innerHTML
      
      // 非字符串，也非DOM节点
      // |>非生产环境打印⚠️信息
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    
    // template不存在，存在el
    } else if (el) {
      // 通过getOuterHTML方法获取template
      template = getOuterHTML(el)
    }

    // template经过上述处理之后，再次判断是否存在
    // |> 可能存在template和el都不存在的情况，那此处会在后续步骤(mountComponent)中打印⚠️信息
    if (template) {
      
      // 非生产环境、performance设为true，且mark函数存在
      // 此处用于性能检测使用
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 调用complieToFunctions函数，得到render和staticRenderFns, 再将其绑定到options上，即this.$options
      // |>调用compileToFunctions包含: 
      // |> 1. parse: 解析template（生成ast抽象语法树)
      // |> 2. optimize: 优化ast抽象语法树(标记静态节点)
      // |> 3. generate：生成render和staticRenderFns
      // |> 不是指compileToFunctions实现了编译，它内部还会调用createCompiler创建编译函数等等
      const { render, staticRenderFns } = compileToFunctions(template, {

        // 是否需要启动某个功能
        // |> 开发时非生产环境出错时，标记出错的具体源代码位置
        outputSourceRange: process.env.NODE_ENV !== 'production',

        // 检测是否需要编码换行符(兼容处理)
        // |> IE会在属性值内编码换行符，而其他浏览器不会
        shouldDecodeNewlines,

        // 检测是否需要编码a[href]中的内容
        // Chrome会对a[href]的内容镜像编码
        shouldDecodeNewlinesForHref,

        // 分隔符
        // 通常模式下是["{{", "}}"]
        delimiters: options.delimiters,

        // 注释
        // true时会保留渲染模板中的HTML注释
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      // 非生产环境、performance设为true，且mark函数存在
      // 此处用于性能检测使用，配合上文performance使用
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * 获取元素的outerHTML，即包含标签部分(PS: innerHTML只有标签内部分)
 * 另外特殊处理IE中SVG元素，它本身不存在outerHTML
 * |> 创建一个div，把svg本身插入div中，然后返回这这个div
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
