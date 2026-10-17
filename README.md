# WAL 质押分布

按地址统计 Walrus 主网 `StakedWal` 的本金分布。页面和 `/api/distribution` 只读已经算好的快照，不为每次访问重扫链上数据。

统计口径：

- 数量是 `principal`，单位 WAL（1 WAL = 10^9 MIST），不含收益。
- 同一地址的多笔对象先加总，再落入互斥区间。
- `Staked` 和 `Withdrawing` 都计入。区间表同时给出地址数和该区间的本金合计。
- 对象主人单独列出，不进地址分桶。这些对象目前主要是交易市场挂单里的 dynamic field。

## 本地

```bash
npm install
npm test
npm run bootstrap
npm run follow
npm run dev
```

`bootstrap` 用 GraphQL 扫一遍存活对象，并记下快照检查点。`follow` 从该检查点之后用 gRPC 连续补洞并订阅新检查点。取回会在对应检查点把对象从账本删除。

页面可以按地址查询。查询读 `data/address-index.json`，和快照一起由 `publish` 写出。`POST /api/addresses`，正文是 `{ "addresses": ["0x..."] }`，一次最多 100 个。

公网数据每天更新一次。GitHub Actions 在北京时间 08:00 重新扫描存活对象，把 `data/snapshot.json` 和 `data/address-index.json` 推到 `main`，Vercel 随后自动部署。定时任务在高峰时可能推迟。扫完的快照对应该次扫描开始时的检查点。

Vercel 不能自己跑这趟扫描。`follow` 仍可以在一台长期在线的机器上把快照追到链头；本地账本还在时，可以用 `npm run republish` 只重写这两份派生文件。
