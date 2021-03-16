/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {

      // 通过Object.create以baseOptions为原型创建finalOptions
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }
      
      // options存在
      // |> $mount阶段调用compileToFunctions的第二个参数
      if (options) {

        // 非生产环境且outputSourceRange设为true，
        // |> 修改warn函数，补充错误开始位置start与结束位置end
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // 前置空白字符长度
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // 合并自定义modules
        // baseOptions中的modules，然后可以附带自定义的modules，以实现拓展性
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // 合并自定义directives
        // baseOptions中的directives，然后可以附带自定义的directives，以实现拓展性
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // 拷贝其他属性
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      // finalOptions带上warn函数
      finalOptions.warn = warn

      // baseCompile指的就是createCompiler中的parse、optimize和generate那个baseCompile函数
      // |> 传入模板template和处理过的finalOptions
      // |> compiled指的就是包含ast、render和staticRenderFns的对象
      const compiled = baseCompile(template.trim(), finalOptions)
      
      // 非正式环境校检抽象语法树ast中有问题的表达式
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }

      // 给compiled对象添加errors和tips信息
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
