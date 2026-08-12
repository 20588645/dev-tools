import CodeMirror from 'codemirror'

import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/dialog/dialog.css'
import 'codemirror/theme/material-darker.css'

/*
 * P9-6 取代 `src/js/vendor/codemirror/cm.bundle.{js,css}`。
 * 引入清单与旧 bundle 完全对齐（core + 7 addon + 14 mode + material-darker 主题），
 * 保证高亮与搜索行为不变。本模块只被编辑器页引用，随路由 chunk 懒加载。
 */
import 'codemirror/addon/dialog/dialog'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/search/jump-to-line'
import 'codemirror/addon/search/search'
import 'codemirror/addon/search/searchcursor'
import 'codemirror/addon/selection/active-line'
import 'codemirror/mode/clike/clike'
import 'codemirror/mode/css/css'
import 'codemirror/mode/go/go'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/markdown/markdown'
import 'codemirror/mode/php/php'
import 'codemirror/mode/python/python'
import 'codemirror/mode/rust/rust'
import 'codemirror/mode/shell/shell'
import 'codemirror/mode/sql/sql'
import 'codemirror/mode/vue/vue'
import 'codemirror/mode/xml/xml'
import 'codemirror/mode/yaml/yaml'

export default CodeMirror
