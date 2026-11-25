# 骨牌造境

## 多路起倒与碰撞合并

文档可用 `startCues` 安排多个不同时刻的起点；旧文档缺少该字段时，会自动把 `startPieceId` 迁移为 `t=0` 的起点。

传播器使用同一条优先队列处理所有时间轴：

- 不同时刻到达同一元件：第一次触达先让元件进入主事件，后续触达记录为 `merged-late`，不会再产生第二次倒下。
- 同一时刻到达：按方向冲量求和。强反向触达胜出，弱触达记录为 `merged-simultaneous`；等强反向冲量抵消时记录为夹持均势。
- 仲裁只使用时间、冲量、方向和坐标等语义字段；元件编号与数组顺序只作为完全同构记录的最后排序键，不决定胜者。
- 主事件保存 `winningReach`、`mergedReaches` 和 `collision.explanation`，事件流中另有 `kind: 'merged'` 的合并记录。

运行无浏览器的确定性验证：

```sh
npm run verify:collisions
```

该脚本验证两路定时交会、先到弱触达压过后到强触达、同刻强弱相反的物理碰撞、一条晚到支路，以及重命名元件并随机打乱列表后的结果不变性。界面左侧「起倒时刻」也可载入对应样例。

## 本地启动

```sh
npm ci
npm run dev
```

在浏览器打开 Vite 输出的本地地址。

## Docker 启动

```sh
docker compose up --build
```

打开 <http://localhost:8032>。端口可通过 `DOMINO_LAB_PORT` 修改。
