"use client";

import { useMemo, useState } from "react";

const PERIODS = [
  {
    days: 7,
    rateFp: 5618684953663022,
  },
  {
    days: 15,
    rateFp: 5143920841621519,
  },
  {
    days: 30,
    rateFp: 26630327103109640,
  },
  {
    days: 60,
    rateFp: 21098882129842568,
  },
  {
    days: 120,
    rateFp: 12612857826115098,
  },
];

const RATE_PRECISION = 1_000_000_000_000_000_000;
const DEV_FEE_BPS = 2500;

export default function CalculatorPage() {
  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState(7);

  const calculation = useMemo(() => {
    const principal = Number(amount) || 0;

    const period =
      PERIODS.find(
        (item) => item.days === lockDays
      ) ?? PERIODS[0];

    const dailyRate =
      period.rateFp /
      RATE_PRECISION;

    const grossMultiplier =
      Math.pow(
        1 + dailyRate,
        period.days
      );

    const finalBalance =
      principal *
      grossMultiplier;

    const grossReward =
      Math.max(
        0,
        finalBalance - principal
      );

    const devFee =
      grossReward *
      DEV_FEE_BPS /
      10_000;

    const userReward =
      grossReward -
      devFee;

    const userFinalBalance =
      principal +
      userReward;

    const apy =
      (grossMultiplier - 1) * 100;

    return {
      principal,
      dailyRate,
      grossReward,
      devFee,
      userReward,
      userFinalBalance,
      apy,
    };
  }, [amount, lockDays]);

  const format = (value: number) =>
    value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">

        <div className="mb-8 text-center">
          <div className="text-xs font-bold tracking-[0.25em] text-[#d4af37]">
            KING SULAIMAN
          </div>

          <h1 className="mt-2 text-3xl font-black md:text-5xl">
            KGSL Reward Calculator
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-500">
            Simulasi reward KGSL berdasarkan
            periode lock dan daily compounding.
          </p>
        </div>

        <section className="rounded-3xl border border-[#d4af37]/20 bg-white/[0.03] p-5 shadow-2xl md:p-8">

          <div className="grid gap-6 md:grid-cols-2">

            {/* AMOUNT */}
            <div>
              <label className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
                STAKE AMOUNT
              </label>

              <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-black/40 px-4">
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value)
                  }
                  className="w-full bg-transparent py-4 text-xl font-black outline-none"
                />

                <span className="text-sm font-bold text-zinc-500">
                  KGSL
                </span>
              </div>
            </div>

            {/* PERIOD */}
            <div>
              <label className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
                LOCK PERIOD
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PERIODS.map((item) => {
                  const reward =
                    (
                      Math.pow(
                        1 +
                          item.rateFp /
                            RATE_PRECISION,
                        item.days
                      ) -
                      1
                    ) * 100;

                  return (
                    <button
                      key={item.days}
                      type="button"
                      onClick={() =>
                        setLockDays(item.days)
                      }
                      className={`rounded-xl border px-3 py-3 transition ${
                        lockDays === item.days
                          ? "border-[#d4af37] bg-[#d4af37]/10 text-[#f5d76e]"
                          : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="text-sm font-black">
                        {item.days}D
                      </div>

                      <div className="mt-1 text-[10px]">
                        +{reward.toFixed(2)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RESULT */}
          <div className="mt-8 grid gap-3 md:grid-cols-2">

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                STAKED
              </div>

              <div className="mt-2 text-2xl font-black">
                {format(calculation.principal)}
                <span className="ml-2 text-sm text-zinc-500">
                  KGSL
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-5">
              <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                GROSS REWARD
              </div>

              <div className="mt-2 text-2xl font-black text-[#f5d76e]">
                +{format(calculation.grossReward)}
                <span className="ml-2 text-sm text-zinc-500">
                  KGSL
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                DEV FEE (25%)
              </div>

              <div className="mt-2 text-2xl font-black">
                {format(calculation.devFee)}
                <span className="ml-2 text-sm text-zinc-500">
                  KGSL
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-5">
              <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                YOUR NET REWARD
              </div>

              <div className="mt-2 text-2xl font-black text-[#f5d76e]">
                +{format(calculation.userReward)}
                <span className="ml-2 text-sm text-zinc-500">
                  KGSL
                </span>
              </div>
            </div>

          </div>

          <div className="mt-4 rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-5">
            <div className="text-[10px] font-bold tracking-wider text-zinc-500">
              ESTIMATED FINAL BALANCE
            </div>

            <div className="mt-2 text-3xl font-black text-[#f5d76e]">
              {format(calculation.userFinalBalance)}
              <span className="ml-2 text-sm text-zinc-500">
                KGSL
              </span>
            </div>

            <div className="mt-2 text-xs text-zinc-600">
              Estimated compounded return:
              {" "}
              {calculation.apy.toFixed(2)}%
            </div>
          </div>

          <div className="mt-6 text-center text-[10px] text-zinc-600">
            Simulasi berdasarkan parameter reward
            KGSL saat ini. Reward aktual bergantung
            pada kondisi staking dan smart contract.
          </div>

        </section>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-xs font-bold text-[#d4af37] hover:text-[#f5d76e]"
          >
            ← Kembali ke KGSL Staking
          </a>
        </div>

      </div>
    </main>
  );
}
