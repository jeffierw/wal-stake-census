# WAL 质押分布

按地址统计 Walrus 主网 `StakedWal` 的本金分布。页面和 `/api/distribution` 只读已经算好的快照，不为每次访问重扫链上数据。

统计口径：

- 数量是 `principal`，单位 WAL（1 WAL = 10^9 MIST），不含收益。
- 同一地址的多笔对象先加总，再落入互斥区间。
- `Staked` 和 `Withdrawing` 都计入。对象主人单独列出，不进地址分桶。

## 本地

```bash
npm install
npm test
npm run bootstrap
npm run follow
npm run dev
```

`bootstrap` 用 GraphQL 扫一遍存活对象，并记下快照检查点。`follow` 从该检查点之后用 gRPC 连续补洞并订阅新检查点。取回会在对应检查点把对象从账本删除。

Vercel 只托管这个 Next.js 页面。常驻的 `follow` 不能跑在 Serverless 上，需要在一台长期在线的机器上运行，再把新的 `data/snapshot.json` 部署出去。
