/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// 为什么需要createCompiler
// |> 传入baseOptions用于处理跨平台性
// |> 什么叫跨平台，如web,mobile,小程序,智能手表等
// |> 以及后续新增新平台，只需实现baseOptions中的方法，然后将其作为参数传入createCompiler即可实现编译函数
// |> baseOptions中的方法，存在特定平台的属性和方法，
// |> 如同一个方法，内部调用特定平台的api来实现，最终实现相同属性名不同实现的baseOptions
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
