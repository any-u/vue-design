/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// createCompiler 允许创建使用 parser(解析器)、optimizer(优化器)、codegen(代码生成器)的编译器
// 比如：SSR优化编译器，此处值使用默认编译器
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  
  // 调用parse将template生成ast抽象语法树
  const ast = parse(template.trim(), options)

  // 调用optimize，优化ast抽象语法树(标记静态节点)
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // 将ast转成render和staticRenderFns
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
