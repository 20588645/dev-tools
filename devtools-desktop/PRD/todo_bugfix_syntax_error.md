# 修复待办任务新建弹窗 JavaScript 语法错误执行计划 (PRD)

## 1. 问题描述
用户反馈“现在点击新建没有反应了”。经排查发现是由于 `todo.js` 在最近一次 `multi_replace_file_content` 替换中，重复写入了 `}).then(...)` 闭合块，导致 JavaScript 加载时发生全局语法解析错误（Uncaught SyntaxError），使得所有依赖 `todo.js` 的交互失效，尤其是“新建任务”按钮无响应。

## 2. 根源分析
在 `todo.js` 的 `showAddTodo` 函数尾部（原 238-245 行附近），代码结构为：
```javascript
    document.getElementById('addTodoTitle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('sysOk').click();
    });
  }).then(result => {
    if (!result) return;
    createTodo(result.title, result.content, result.remindAt);
  });
  }).then(result => {
    if (!result) return;
    createTodo(result.title, result.content, result.remindAt);
  });
```
重复的 `}).then(...)` 段导致了解析异常，多余的闭合大括号和括号截断了 JS 执行。

## 3. 修改方案
移除冗余的 `}).then(...)`，保持仅有一个 `then` 链式调用用于处理创建结果。

```diff
     document.getElementById('addTodoTitle').addEventListener('keydown', (e) => {
       if (e.key === 'Enter') document.getElementById('sysOk').click();
     });
   }).then(result => {
     if (!result) return;
     createTodo(result.title, result.content, result.remindAt);
   });
-  }).then(result => {
-    if (!result) return;
-    createTodo(result.title, result.content, result.remindAt);
-  });
 }
```

## 4. 验证计划
- 运行打包与重启命令，拉起 DevTools 桌面应用。
- 确认点击“新建任务”后，弹窗能正常展示。
- 确认弹窗没有 JS 报错。
