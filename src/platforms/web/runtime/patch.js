/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.

// 应用了所有内置模块之后，最后应用指令模块。
const modules = platformModules.concat(baseModules)

// createPatchFunction -> 创建patch函数
// |> 跟compile一样的方式
// |> 可以传入一些平台适配性方法
export const patch: Function = createPatchFunction({ nodeOps, modules })
