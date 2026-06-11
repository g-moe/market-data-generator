# Column Naming Strategy

```typescript
// Format:
// calc__name:<humanName>__tf:<timeframe>__id:<indicator>__<param>:<value>__out:<output>

// 1. prefix = "calc__"
// - columns that we care about the value
// - anything without this prefix is ignored

// 2. name = name:<humanName>
// - human/internal reference name
// - used for readability, not machine meaning
// - should contain only letters and numbers
// - example: name:20smaOn5minChart

// 3. timeframe = tf:<interval><intervalType> (this is not the driver series, that is implicit for whatever the .csv file is. This tf is either the same as the file OR an alternate context)
// - tf:same = implicit from csv file
// - tf:1d = 1 day
// - tf:5m = 5 minutes
// - tf:15s = 15 seconds
// - tf:500v = 500 volume bars
// - tf:100t = 100 tick bars

// 4. indicator id = id:<indicator>
// - id:sma = simple moving average
// - id:ema = exponential moving average
// - id:rsi = relative strength index
// - id:macd = moving average convergence divergence

// 5. indicator params = <param>:<value>
// - params are arbitrary key/value pairs
// - src:open
// - len:100
// - fast:12
// - slow:26
// - signal:9

// 6. indicator output
// - the column value is the calculated indicator output for that full definition
// - example: calc__name:100sma__tf:same__id:sma__src:close__len:100__out:value

// Examples:
// 100 sma
// calc__name:100sma__tf:same__id:sma__src:close__len:100__out:value

// 20d sma
// calc__name:20daySMA__tf:1d__id:sma__src:close__len:20__out:value

// MACD
// calc__name:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:value
// calc__name:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:hist
// calc__name:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:signal
```

# Parsing Column Name

```typescript
type ParsedCalcColumnName = {
	id: string;
	name: string;
	params: Record<string, string>;
	out: string;
	tf: string;
};

export function parseCalcColumnName(columnName: string): ParsedCalcColumnName {
	const parts = columnName.replace('calc__', '').split('__');

	const parsed: ParsedCalcColumnName = {
		id: '',
		name: '',
		params: {},
		out: '',
		tf: ''
	};

	for (const part of parts) {
		const [key, value] = part.split(':');

		if (key === 'id') parsed.id = value;
		else if (key === 'name') parsed.name = value;
		else if (key === 'out') parsed.out = value;
		else if (key === 'tf') parsed.tf = value;
		else parsed.params[key] = value;
	}

	return parsed;
}
```

# Output 

This record must be manually maintained and kept in sync with what each chart in `!tradester.Cht` has applied to it. 

## 5 minute indicators

```txt
// 5min

Studyname: 100sma
- out: value


```

## 1d indicators

```txt
// 1d

Studyname: 100sma
- out: value
```
