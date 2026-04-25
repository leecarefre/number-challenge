# Cocos MCP Server 使用说明

> 本文档说明在 NumLink Challenge 开发过程中，Claude 如何通过 MCP Server 操作 Cocos Editor 搭建场景。

---

## 一、前提条件（每次开发前检查）

### 你需要做的事

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 打开 Cocos Creator | 保持编辑器运行，不要关闭 |
| 2 | 启动 MCP Server | 菜单栏 → `Extension` → `Cocos MCP Server` → `Open Panel` → 点击 **Start Server** |
| 3 | 确认服务状态 | Panel 中显示 `Running on http://127.0.0.1:3000` 即为正常 |
| 4 | 打开项目 | 确保 `number-challenge` 项目已加载完成（资源数据库 ready） |

### Claude 会自动验证
每次开始操作前，Claude 会先调用 `/api/server/get_server_status` 确认服务可用，再进行后续操作。

---

## 二、协作规范

### 操作期间请注意

- **不要在 Claude 操作场景时手动编辑同一个场景** — 同时修改会导致数据冲突，场景可能损坏
- **等待 Claude 提示「操作完成」后再继续编辑** — Claude 会明确告知每步完成状态
- **如遇 Editor 卡顿** — 等待 Cocos 脚本编译完成（底部状态栏显示进度），编译期间 MCP 操作会等待

### 脚本编译等待
TypeScript 脚本修改后，Cocos 需要重新编译（通常 3–10 秒）。Claude 在写完脚本文件后会提示你：
> 「脚本已写入，请等待 Cocos 编译完成后告诉我，再继续下一步。」

---

## 三、MCP 工具分类与用途

### 场景管理
| 工具 | 用途 |
|------|------|
| `scene_create_scene` | 创建新场景文件 |
| `scene_open_scene` | 打开指定场景 |
| `scene_save_scene` | 保存当前场景（每次操作完必调用） |
| `scene_get_scene_hierarchy` | 获取当前场景节点树（用于确认结构） |

### 节点操作
| 工具 | 用途 |
|------|------|
| `node_create_node` | 在指定父节点下创建新节点 |
| `node_set_node_transform` | 设置节点位置 / 旋转 / 缩放 |
| `node_set_node_property` | 设置节点基础属性（名称、active、layer） |
| `node_find_node_by_name` | 按名称查找节点获取 UUID |
| `node_delete_node` | 删除节点 |

### 组件操作
| 工具 | 用途 |
|------|------|
| `component_add_component` | 添加内置组件（cc.Label / cc.Sprite / cc.Button 等） |
| `component_set_component_property` | 设置组件属性（文字内容 / 颜色 / 大小） |
| `component_attach_script` | 挂载自定义 TypeScript 脚本 |
| `component_get_components` | 查看节点已有组件列表 |

### 预制体
| 工具 | 用途 |
|------|------|
| `prefab_create_prefab` | 将场景节点保存为 Prefab 文件 |
| `prefab_instantiate_prefab` | 在场景中实例化 Prefab |

### 资源管理
| 工具 | 用途 |
|------|------|
| `project_create_asset` | 创建脚本 / JSON 等资源文件 |
| `project_refresh_assets` | 刷新资源数据库（导入新文件后调用） |
| `project_get_assets` | 列出指定目录下的资源 |

### 参考图（UI 对照开发）
| 工具 | 用途 |
|------|------|
| `referenceImage_add_reference_image` | 将 UI 截图挂到场景视图作为参考底图 |
| `referenceImage_set_reference_image_opacity` | 调整参考图透明度（建议 0.4–0.6） |
| `referenceImage_remove_reference_image` | 开发完成后移除参考图 |

### 调试
| 工具 | 用途 |
|------|------|
| `debug_execute_script` | 在场景上下文执行 JS（验证逻辑） |
| `debug_get_console_logs` | 获取 Editor 控制台日志 |
| `debug_validate_scene` | 检查场景是否有缺失资源或错误 |

---

## 四、标准操作流程

### 新建一个场景

```
1. scene_create_scene      { sceneName: "Game", savePath: "db://assets/scenes" }
2. scene_open_scene        { scenePath: "db://assets/scenes/Game.scene" }
3. node_create_node        创建 Canvas 根节点（nodeType: "Canvas"）
4. ... 构建节点树 ...
5. scene_save_scene        保存
```

### 搭建一个 UI 节点（以 Label 为例）

```
1. node_find_node_by_name  找到父节点，获取 UUID
2. node_create_node        在父节点下创建新节点，获取新节点 UUID
3. node_set_node_transform 设置位置和大小
4. component_add_component 添加 cc.Label 组件
5. component_set_component_property 设置文字内容、字体大小、颜色
6. scene_save_scene        保存场景
```

### 挂载脚本

```
1. （Write 工具）写入 .ts 脚本文件到 assets/scripts/
2. project_refresh_assets  刷新资源库，让 Editor 识别新脚本
3. （等待 Cocos 编译完成）
4. node_find_node_by_name  找到目标节点 UUID
5. component_attach_script { nodeUuid: "...", scriptPath: "db://assets/scripts/xxx.ts" }
6. scene_save_scene        保存
```

### 对照 UI 截图开发

```
1. referenceImage_add_reference_image
   { paths: ["c:/Users/李元潮/Desktop/number-challenge/docs/screenshots/ui_game.jpeg"] }
2. referenceImage_set_reference_image_opacity { opacity: 0.5 }
3. ... 正常搭建节点 ...
4. referenceImage_remove_reference_image  完成后移除
```

---

## 五、本项目各场景的参考图对应关系

| 场景文件 | 对应参考截图 |
|---------|------------|
| Boot.scene | `screenshots/loading.png` |
| Home.scene | `screenshots/ui_home.png` |
| Game.scene | `screenshots/ui_game.jpeg` |
| Shop.scene | `screenshots/shop.jpeg` |
| PrivacyDialog.prefab | `screenshots/privacy.png` |
| FirstPlayDialog.prefab | `screenshots/firstplay.png` |
| SignInDialog.prefab | `screenshots/signin.jpeg` |
| TutorialScene | `screenshots/tutorial.png` |

---

## 六、常见问题

**Q：MCP 操作返回 `{"error":"Not found"}`**  
A：路由写错，检查 API 路径是否正确（格式为 `/api/{category}/{toolName}`）。

**Q：`component_attach_script` 失败，提示找不到脚本**  
A：脚本文件写入后需要先调用 `project_refresh_assets`，并等待 Cocos 编译完成。

**Q：节点创建成功但在编辑器里看不到**  
A：检查节点的 `active` 属性和 `layer` 设置，或调用 `scene_get_scene_hierarchy` 确认节点已存在。

**Q：场景操作后编辑器没有变化**  
A：调用 `scene_save_scene` 后在 Cocos Editor 里按 `Ctrl+Z` 可以撤销，确认操作是否生效。

**Q：MCP Server 突然断连**  
A：重新在 Extension Panel 中点击 Start Server，Claude 下次操作前会自动重新验证连接。

---

## 七、注意事项

1. **所有路径使用 `db://` 协议** — Cocos 内部资源路径格式为 `db://assets/...`，不是磁盘绝对路径
2. **每次操作完必须保存** — `scene_save_scene` 是必须的，否则关闭编辑器会丢失修改
3. **Prefab 修改需要重新保存** — 修改 Prefab 实例后调用 `prefab_update_prefab` 同步到 Prefab 文件
4. **大批量操作分批进行** — 单次创建节点过多可能导致超时，Claude 会自动分批处理
