# koishi-plugin-toutai-altered

[<img alt="github" src="https://img.shields.io/badge/github-oculr/toutai-8da0cb?style=for-the-badge&labelColor=555555&logo=github" height="20">](https://github.com/oculr/koishi-plugin-toutai)
[<img alt="npm" src="https://img.shields.io/npm/v/koishi-plugin-toutai-altered.svg?style=for-the-badge&color=fc8d62&logo=npm" height="20">](https://www.npmjs.com/package/koishi-plugin-toutai-altered)

## 简介

Koishi 的投胎模拟器搞耍版。投胎到中国或世界各地，并收获一份关于国家、省份、城乡落点和家庭排位的锐评。

## 使用

1. 启动 `puppeteer` 服务。
2. 设置指令别名。

## 数据口径

- 世界投胎权重采用联合国人口司《World Population Prospects 2024》的 2025 年中方案年度出生人数；2024 年起为预测值。
- 中国大陆采用国家统计局公布的 2025 年出生人口 792 万、出生率 5.63‰。
- 国家统计局未发布同口径的 2025 年省份、城乡、胎次和性别完整交叉表，因此相关结构沿用原始明细的比例，并按 792 万总量等比例缩放，不代表官方省级实数。
- 港澳台投胎权重采用联合国 WPP 2024 的 2025 年中方案值。

来源：[联合国 WPP 2024](https://population.un.org/wpp/)、[国家统计局《中华人民共和国2025年国民经济和社会发展统计公报》](https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html)。

维护者可下载联合国[官方 CSV](https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20%28Standard%29/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz) 后运行 `npm run data:update -- <文件路径>`，重新生成投胎权重。

## 原仓库

[https://github.com/araea/koishi-plugin-toutai](https://github.com/araea/koishi-plugin-toutai)
