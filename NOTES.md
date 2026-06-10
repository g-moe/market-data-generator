# Output Shapes

## 1. Raw ticks for .scid

```scid
Timestamp, Open, High, Low, Close, Transactions, Volume, Bid Volume, Ask Volume
```

## 2. Candles for .json

```typescript
/** Md candlestick bar */
export type MdCandle = {
	/** Unique BarId */
	id: bigint;
	/** Bar close */
	close: number;
	/** Bar high */
	high: number;
	/** Bar low */
	low: number;
	/** Bar open */
	open: number;
	/** Array Index Position */
	pos: number;
	/** Bars date time */
	time: UnixMs;
	/** Bar volume */
	volume: number;
	/** Bar vwap */
	vwap: number;
};

/** Md candlestick bar with volume by price */
type MdCandleVolumeByPrice = {
	prices: Map<price, volume>;
} & MdCandle;
```

# Sierra requirements

- since we use the format `tradester_${symbolId}.scid` for SCID files, sierra does not know what `tradester_${symbolId}` symbol is; we must manually add each symbol to sierra's symbol list `Global Settings >> Symbol Settings >> Find the real symbol >> Duplicate >> Change the name to our format (eg. tradester_ES) ... this gives us the symbol with the correct config (tick size, etc.)`
  - symbols we have added to sierra: `tradester_ES`, `tradester_NQ`


- in the tradester_ES.cht we have to manually set the start/end dates in chart settings for each chart timeframe otherwise our start/end calculations will not be aligned.