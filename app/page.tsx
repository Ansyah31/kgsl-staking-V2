"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";

import {
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  AnchorProvider,
  BN,
  Program,
} from "@coral-xyz/anchor";

import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

import { Buffer } from "buffer";

import idlData from "../idl/staking_program.json";

/* ============================================================
   CONFIG
============================================================ */

const PROGRAM_ID = new PublicKey(
  "6L1pszERmfG15M3Rw1X872FV87eqPyer4CD2TasUGTgs"
);

const KGSL_MINT = new PublicKey(
  "J4W7Cseg9M185SUQHn53ooBCMpyfdFzmCdh8VFU5Jg8z"
);

const REWARD_MINT = new PublicKey(
  "J4W7Cseg9M185SUQHn53ooBCMpyfdFzmCdh8VFU5Jg8z"
);

const DEV_WALLET = new PublicKey(
  "9zjFSQDmj7SQuAXtvwDYWFcYHtrKvdL6sPkaMoBLezT8"
);

const POOL_SEED = Buffer.from("staking_pool");
const STAKE_SEED = Buffer.from("stake");

function getStakePda(
  owner: PublicKey,
  positionId: number
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      STAKE_SEED,
      owner.toBuffer(),
      new BN(positionId).toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  )[0];
}

async function findNextAvailablePosition(
  program: any,
  owner: PublicKey
): Promise<number> {
  for (
    let candidate = 0;
    candidate <= 20;
    candidate++
  ) {
    const candidatePda =
      getStakePda(
        owner,
        candidate
      );

    const account =
      await program.account.stakeAccount.fetchNullable(
        candidatePda
      );

    if (!account) {
      return candidate;
    }
  }

  throw new Error(
    "Semua Position ID 0-20 sudah digunakan."
  );
}

const DECIMALS = 6;

const LOCKS = [
  { days: 7, label: "7 Hari" },
  { days: 15, label: "15 Hari" },
  { days: 30, label: "30 Hari" },
  { days: 60, label: "60 Hari" },
  { days: 120, label: "120 Hari" },
];

const TEXT = {
  id: {
    wallet: "DOMPET ANDA",
    pendingReward: "REWARD TERTUNDA",
    reward: "REWARD",
    stakeAmount: "JUMLAH STAKE",
    amountToStake: "JUMLAH YANG DI-STAKE",
    lockPeriod: "PERIODE LOCK",
    staked: "DI-STAKE",
    compoundBalance: "SALDO COMPOUND",
    accruedReward: "REWARD TERKUMPUL",
    lockStatus: "STATUS LOCK",
    claimReward: "KLAIM REWARD",
    unstake: "UNSTAKE",
    locked: "TERKUNCI",
    readyToUnstake: "SIAP UNSTAKE",
    referralProgram: "PROGRAM REFERRAL",
    unlockHigher: "Buka Periode Lock Lebih Tinggi",
    activeReferrals: "REFERRAL AKTIF",
    lock: "LOCK",
    myReferral: "REFERRAL SAYA",
    referralCode: "KODE REFERRAL",
    referralLink: "LINK REFERRAL",
    copyReferral: "SALIN LINK REFERRAL",
    joinReferral: "GABUNG REFERRAL",
  },

  en: {
    wallet: "YOUR WALLET",
    pendingReward: "PENDING REWARD",
    reward: "REWARD",
    stakeAmount: "STAKE AMOUNT",
    amountToStake: "AMOUNT TO STAKE",
    lockPeriod: "LOCK PERIOD",
    staked: "STAKED",
    compoundBalance: "COMPOUND BALANCE",
    accruedReward: "ACCRUED REWARD",
    lockStatus: "LOCK STATUS",
    claimReward: "CLAIM REWARD",
    unstake: "UNSTAKE",
    locked: "LOCKED",
    readyToUnstake: "READY TO UNSTAKE",
    referralProgram: "REFERRAL PROGRAM",
    unlockHigher: "Unlock Higher Lock Periods",
    activeReferrals: "ACTIVE REFERRALS",
    lock: "LOCK",
    myReferral: "MY REFERRAL",
    referralCode: "REFERRAL CODE",
    referralLink: "REFERRAL LINK",
    copyReferral: "COPY REFERRAL LINK",
    joinReferral: "JOIN REFERRAL",
  },
};

/* ============================================================
   TYPES
============================================================ */

type StakeState = {
  amount: number;
  startTime: number;
  unlockTime: number;
  lastRewardTime: number;
  compoundBalance: number;
  accruedReward: number;
  canClaim: boolean;
  pda: PublicKey | null;
};

const EMPTY_STAKE: StakeState = {
  amount: 0,
  startTime: 0,
  unlockTime: 0,
  lastRewardTime: 0,
  compoundBalance: 0,
  accruedReward: 0,
  canClaim: false,
  pda: null,
};

/* ============================================================
   HELPERS
============================================================ */

function toNumber(value: any): number {
  if (value == null) return 0;

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value?.toNumber === "function") {
    try {
      return value.toNumber();
    } catch {
      return 0;
    }
  }

  const n = Number(
    value?.toString?.() ?? value
  );

  return Number.isFinite(n) ? n : 0;
}

function toBigInt(value: any): bigint {
  if (value == null) return BigInt(0);

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }

  if (typeof value?.toString === "function") {
    return BigInt(value.toString());
  }

  return BigInt(String(value));
}

function tokensToBN(value: string): BN {
  const clean = value.trim().replace(",", ".");

  if (
    !clean ||
    !Number.isFinite(Number(clean)) ||
    Number(clean) <= 0
  ) {
    throw new Error("Jumlah KGSL tidak valid.");
  }

  const parts = clean.split(".");

  const whole = parts[0] || "0";
  const fraction = parts[1] || "";

  const frac = (
    fraction +
    "0".repeat(DECIMALS)
  ).slice(0, DECIMALS);

  return new BN(whole)
    .mul(
      new BN(10).pow(
        new BN(DECIMALS)
      )
    )
    .add(
      new BN(frac || "0")
    );
}

function tokenAmount(raw: any): number {
  return (
    toNumber(raw) /
    10 ** DECIMALS
  );
}

function formatToken(
  value: number,
  language: "id" | "en",
  decimals = 6
): string {
  return new Intl.NumberFormat(
    language === "id" ? "id-ID" : "en-US",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }
  ).format(value);
}

/* ============================================================
   MAIN
============================================================ */

export default function StakingDashboard() {
  const { connection } = useConnection();

  useEffect(() => {
    console.log("========================================");
    console.log("       SOLANA CONNECTION DEBUG");
    console.log("========================================");

    console.log(
      "RPC endpoint:",
      connection.rpcEndpoint
    );

    connection.getVersion()
      .then((version) => {
        console.log(
          "Solana version:",
          version
        );
      })
      .catch((err) => {
        console.error(
          "RPC VERSION ERROR:",
          err
        );
      });

    connection.getAccountInfo(PROGRAM_ID)
      .then((info) => {
        console.log(
          "PROGRAM ID:",
          PROGRAM_ID.toBase58()
        );

        console.log(
          "PROGRAM EXISTS:",
          !!info
        );

        console.log(
          "PROGRAM OWNER:",
          info?.owner?.toBase58() || "NOT FOUND"
        );

        console.log(
          "PROGRAM EXECUTABLE:",
          info?.executable ?? false
        );

        console.log(
          "PROGRAM DATA LENGTH:",
          info?.data?.length ?? 0
        );
      })
      .catch((err) => {
        console.error(
          "PROGRAM ACCOUNT ERROR:",
          err
        );
      });

    console.log("========================================");
  }, [connection]);


  const wallet = useWallet();

  const {
    publicKey,
    signTransaction,
    signAllTransactions,
  } = wallet;

  const [mounted, setMounted] =
    useState(false);

  const [lightMode, setLightMode] =
    useState(false);

  const [language, setLanguage] =
    useState<"id" | "en">("id");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successModal, setSuccessModal] = useState<{
    title: string;
    message: string;
    amount?: string;
    signature: string;
  } | null>(null);

  const [amount, setAmount] =
    useState("");

  const [lockDays, setLockDays] =
    useState(7);

  const [walletBalance, setWalletBalance] =
    useState(0);

  const [rewardBalance, setRewardBalance] =
    useState(0);

  const [poolTotal, setPoolTotal] =
    useState(0);

  const [poolExists, setPoolExists] =
    useState(false);

  const [poolMint, setPoolMint] =
    useState(KGSL_MINT);

  const [rewardMint, setRewardMint] =
    useState(REWARD_MINT);

  const [poolTreasury, setPoolTreasury] =
    useState<PublicKey | null>(null);

  /* ==========================================================
     REFERRAL
  ========================================================== */

  const [referralCode, setReferralCode] =
    useState("");

  const [referrerWallet, setReferrerWallet] =
    useState("");

  const [activeReferrals, setActiveReferrals] =
    useState(0);

  const [myReferralCode, setMyReferralCode] =
    useState("");

  const [myReferralRegistered, setMyReferralRegistered] =
    useState(false);


  /* ==========================================================
     OWN {t.referralCode}
     Kode milik wallet sendiri.
  ========================================================== */

  const ownReferralCode = useMemo(() => {
    if (!publicKey) return "";

    if (publicKey.equals(DEV_WALLET)) {
      return "KGSL-ROOT";
    }

    return `KGSL-${publicKey
      .toBase58()
      .slice(0, 10)}`;
  }, [publicKey]);

  const [referralVerified, setReferralVerified] =
    useState(false);

  const [verifiedReferrer, setVerifiedReferrer] =
    useState("");


  /* ==========================================================
     {t.referralLink}
     Baca ?ref=KODE dari URL
  ========================================================== */

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params =
      new URLSearchParams(
        window.location.search
      );

    const ref =
      params.get("ref")?.trim() || "";

    if (!ref) return;

    if (ref.length > 16) {
      console.warn(
        "Referral code dari URL terlalu panjang."
      );
      return;
    }

    setReferralCode(ref);
    setReferralVerified(false);
    setVerifiedReferrer("");

    console.log(
      "{t.referralCode} DARI LINK:",
      ref
    );
  }, []);

  const [stake, setStake] =
    useState<StakeState>(EMPTY_STAKE);

  const [totalActiveStake, setTotalActiveStake] =
    useState(0);

  // Semua posisi staking wallet.
  const [positions, setPositions] =
    useState<StakeState[]>([]);

  // Total reward pending dari seluruh posisi staking.
  const totalPendingReward = useMemo(
    () =>
      positions.reduce(
        (total, position) =>
          total + position.accruedReward,
        0
      ),
    [positions]
  );

  console.log("===== TOTAL PENDING REWARD DEBUG =====");
  console.log(
    "POSITIONS:",
    positions.map((position) => ({
      positionId: -1,
      amount: position.amount,
      accruedReward: position.accruedReward,
      canClaim: position.canClaim,
    }))
  );
  console.log(
    "TOTAL PENDING REWARD:",
    totalPendingReward
  );

  // Posisi yang sedang dipilih untuk Claim / Unstake.
  const [selectedPositionId, setSelectedPositionId] =
    useState(0);

  const [positionId, setPositionId] =
    useState(0);

  // Waktu blockchain dari RPC Solana.
  // Digunakan untuk status LOCKED/UNLOCKED agar
  // frontend mengikuti Clock::get() pada smart contract.
  const [blockchainTime, setBlockchainTime] =
    useState<number>(0);

  const refreshingRef =
    useRef(false);

  /* ==========================================================
     PDA
  ========================================================== */

  const poolPda = useMemo(() => {
    return PublicKey.findProgramAddressSync(
      [POOL_SEED],
      PROGRAM_ID
    )[0];
  }, []);

  const stakePda = useMemo(() => {
    if (!publicKey) {
      return null;
    }

    return getStakePda(
      publicKey,
      positionId
    );
  }, [
    publicKey,
    positionId,
  ]);

  const referralPda = useMemo(() => {
    if (!publicKey) {
      return null;
    }

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("referral"),
        publicKey.toBuffer(),
      ],
      PROGRAM_ID
    )[0];
  }, [publicKey]);

  /* ==========================================================
     REFERRAL ACCOUNT
  ========================================================== */

  const refreshReferral = useCallback(
    async () => {
      if (!publicKey || !referralPda) {
        setActiveReferrals(0);
        setMyReferralCode("");
        setMyReferralRegistered(false);
        return;
      }

      try {
        // ======================================================
        // BLOCKCHAIN TIME
        // ======================================================
        // Ambil waktu dari slot blockchain agar frontend
        // mengikuti Clock::get() pada smart contract.
        const currentSlot =
          await connection.getSlot("confirmed");

        const currentBlockTime =
          await connection.getBlockTime(
            currentSlot
          );

        if (
          currentBlockTime !== null
        ) {
          setBlockchainTime(
            currentBlockTime
          );
        }

        const provider =
          new AnchorProvider(
            connection,
            {
              publicKey,
              signTransaction:
                async (tx: any) => tx,
              signAllTransactions:
                async (txs: any[]) => txs,
            } as any,
            {
              commitment: "confirmed",
            }
          );

        const program =
          new Program(
            idlData as any,
            provider
          );

        const account: any =
          await (
            program.account as any
          )
            .referralAccount
            .fetchNullable(
              referralPda
            );

        if (!account) {
          setActiveReferrals(0);
          setMyReferralCode("");
          setMyReferralRegistered(false);
          return;
        }

        setActiveReferrals(
          toNumber(
            account.activeReferrals ??
              account.active_referrals ??
              0
          )
        );

        setMyReferralCode(
          String(
            account.referralCode ??
              account.referral_code ??
              ""
          )
        );

        setMyReferralRegistered(true);
      } catch (e) {
        console.error(
          "REFERRAL FETCH ERROR",
          e
        );

        setActiveReferrals(0);
        setMyReferralCode("");
        setMyReferralRegistered(false);
      }
    },
    [
      connection,
      publicKey,
      referralPda,
    ]
  );

  /* ==========================================================
     FIND REFERRER BY {t.referralCode}
  ========================================================== */

  const findReferrerByCode = useCallback(
    async (code: string) => {
      const normalizedCode = code.trim();

      if (!normalizedCode) {
        throw new Error(
          "Referral code tidak ditemukan."
        );
      }

      const provider =
        new AnchorProvider(
          connection,
          {
            publicKey:
              publicKey ||
              PublicKey.default,

            signTransaction:
              async (tx: any) => tx,

            signAllTransactions:
              async (txs: any[]) => txs,
          } as any,
          {
            commitment: "confirmed",
          }
        );

      const program =
        new Program(
          idlData as any,
          provider
        );

      const accounts: any[] =
        await (
          program.account as any
        )
          .referralAccount
          .all();

      const found = accounts.find(
        (item: any) => {
          const account =
            item.account;

          const onChainCode =
            String(
              account.referralCode ??
                account.referral_code ??
                ""
            ).trim();

          return (
            onChainCode ===
            normalizedCode
          );
        }
      );

      if (!found) {
        throw new Error(
          "Referral code tidak ditemukan di blockchain."
        );
      }

      const referrerPubkey =
        found.account.owner;

      if (!referrerPubkey) {
        throw new Error(
          "Pemilik referral tidak ditemukan."
        );
      }

      const referrer =
        referrerPubkey instanceof PublicKey
          ? referrerPubkey
          : new PublicKey(
              referrerPubkey.toString()
            );

      if (
        publicKey &&
        referrer.equals(publicKey)
      ) {
        throw new Error(
          "Anda tidak dapat menggunakan referral sendiri."
        );
      }

      return {
        referrerPubkey: referrer,
        referrerReferralPda:
          found.publicKey,
        referralAccount:
          found.account,
      };
    },
    [
      connection,
      publicKey,
    ]
  );

  /* ==========================================================
     VERIFY REFERRER
  ========================================================== */

  const verifyReferrer = useCallback(
    async () => {
      const code = referralCode.trim();

      if (!code) {
        throw new Error(
          "Masukkan referral code."
        );
      }

      if (code.length > 16) {
        throw new Error(
          "Referral code maksimal 16 karakter."
        );
      }

      return await findReferrerByCode(code);
    },
    [
      referralCode,
      findReferrerByCode,
    ]
  );

  /* ==========================================================
     VERIFY REFERRAL ACTION
  ========================================================== */

  const doVerifyReferral = async () => {
    setLoading(true);
    setError("");
    setReferralVerified(false);
    setVerifiedReferrer("");

    try {
      if (!publicKey) {
        throw new Error(
          "Hubungkan Phantom terlebih dahulu."
        );
      }

      /*
       * ROOT / DEV:
       *
       * ROOT tidak mempunyai referrer sebelumnya.
       * ROOT menggunakan PublicKey.default sebagai
       * referrer sesuai smart contract.
       *
       * ROOT tidak perlu memasukkan atau memverifikasi
       * referral code dari wallet lain.
       */
      if (publicKey.equals(DEV_WALLET)) {
        setReferralVerified(true);
        setVerifiedReferrer(
          PublicKey.default.toBase58()
        );

        console.log(
          "ROOT REFERRAL VERIFIED:",
          {
            code: ownReferralCode,
            referrer:
              PublicKey.default.toBase58(),
          }
        );

        return;
      }

      const code =
        referralCode.trim();

      if (!code) {
        throw new Error(
          "Masukkan referral code."
        );
      }

      /*
       * USER BIASA:
       *
       * Cari pemilik referral code langsung
       * dari ReferralAccount on-chain.
       */
      const result =
        await verifyReferrer();

      setReferralVerified(true);

      setVerifiedReferrer(
        result.referrerPubkey.toBase58()
      );

      console.log(
        "REFERRAL VERIFIED:",
        {
          code,
          referrer:
            result.referrerPubkey.toBase58(),
          referralPda:
            result.referrerReferralPda.toBase58(),
        }
      );
    } catch (e: any) {
      console.error(
        "VERIFY REFERRAL ERROR",
        e
      );

      setReferralVerified(false);
      setVerifiedReferrer("");

      setError(
        e?.message ||
          String(e)
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     REGISTER REFERRAL
  ========================================================== */

  const doRegisterReferral = async () => {
    if (!publicKey) {
      setError(
        "Hubungkan Phantom terlebih dahulu."
      );
      return;
    }

    if (myReferralRegistered) {
      setError(
        "Wallet ini sudah memiliki Referral Account."
      );
      return;
    }

    const isRootAuthority =
      publicKey.equals(DEV_WALLET);

    if (!isRootAuthority && !referralVerified) {
      setError(
        "Verifikasi referral terlebih dahulu."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const program =
        getProgram();

      const result = {
        referrerPubkey:
          isRootAuthority
            ? PublicKey.default
            : new PublicKey(verifiedReferrer),
      };

      const referralAccount =
        referralPda;

      if (!referralAccount) {
        throw new Error(
          "Referral PDA tidak tersedia."
        );
      }

      console.log("=== REGISTER REFERRAL DEBUG ===");
      console.log("Owner:", publicKey.toBase58());
      console.log("Pool PDA:", poolPda.toBase58());
      console.log(
        "Pool exists:",
        !!(await connection.getAccountInfo(poolPda))
      );
      console.log(
        "Pool owner:",
        (
          await connection.getAccountInfo(poolPda)
        )?.owner?.toBase58()
      );
      console.log(
        "Program ID:",
        PROGRAM_ID.toBase58()
      );
      console.log(
        "Referrer:",
        result.referrerPubkey.toBase58()
      );

      const data =
        program.coder.instruction.encode(
          "registerReferral",
          {
            referralCode:
              ownReferralCode,
          }
        );

      const instruction =
        new TransactionInstruction({
          programId: PROGRAM_ID,

          keys: [
            {
              pubkey: publicKey,
              isSigner: true,
              isWritable: true,
            },

            {
              pubkey: poolPda,
              isSigner: false,
              isWritable: true,
            },

            {
              pubkey: referralAccount,
              isSigner: false,
              isWritable: true,
            },

            {
              pubkey:
                result.referrerPubkey,
              isSigner: false,
              isWritable: false,
            },

            {
              pubkey:
                SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],

          data,
        });

      console.log(
        "=== MANUAL REGISTER REFERRAL ==="
      );

      instruction.keys.forEach(
        (key, index) => {
          console.log(
            "ACCOUNT[" + index + "]",
            key.pubkey.toBase58(),
            "signer=",
            key.isSigner,
            "writable=",
            key.isWritable
          );
        }
      );

      const latestBlockhash =
        await connection.getLatestBlockhash(
          "confirmed"
        );

      const transaction =
        new Transaction();

      transaction.feePayer =
        publicKey;

      transaction.recentBlockhash =
        latestBlockhash.blockhash;

      transaction.add(
        instruction
      );

      if (!signTransaction) {
        throw new Error(
          "Wallet tidak mendukung signTransaction."
        );
      }

      const signed =
        await signTransaction(
          transaction
        );

      const sig =
        await connection.sendRawTransaction(
          signed.serialize(),
          {
            skipPreflight: false,
          }
        );

      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash:
            latestBlockhash.blockhash,
          lastValidBlockHeight:
            latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      console.log(
        "REGISTER REFERRAL SIGNATURE:",
        sig
      );

      setReferralVerified(false);
      setVerifiedReferrer("");

      await refreshReferral();

      alert(
        "Referral berhasil didaftarkan!\n\n" +
        `Code: ${ownReferralCode}\n` +
        `Referrer: ${result.referrerPubkey.toBase58()}\n\n` +
        `Transaction:\n${sig}`
      );

      setReferralCode("");
      setReferrerWallet("");
    } catch (e: any) {
      console.error(
        "REGISTER REFERRAL ERROR",
        e
      );

      if (e?.logs) {
        console.error(
          "ANCHOR LOGS:",
          e.logs
        );
      }

      setError(
        e?.message ||
          String(e)
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     PROGRAM
  ========================================================== */

  const getProgram = useCallback(() => {
    if (
      !publicKey ||
      !signTransaction
    ) {
      throw new Error(
        "Hubungkan Phantom terlebih dahulu."
      );
    }

    const provider =
      new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          signAllTransactions:
            signAllTransactions ||
            (async (txs: any[]) => txs),
        } as any,
        {
          commitment: "confirmed",
        }
      );

    return new Program(
      idlData as any,
      provider
    );
  }, [
    connection,
    publicKey,
    signTransaction,
    signAllTransactions,
  ]);

  /* ==========================================================
     REFRESH ON-CHAIN
  ========================================================== */

  const refresh = useCallback(
    async () => {
      if (!connection) return;

      if (refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;

      try {
        // ======================================================
        // BLOCKCHAIN TIME
        // Ambil langsung dari RPC di dalam refresh().
        // Jangan bergantung pada refreshReferral(), karena
        // refresh() dapat berjalan lebih dahulu.
        // ======================================================
        const currentSlot =
          await connection.getSlot("confirmed");

        const currentBlockTime =
          await connection.getBlockTime(
            currentSlot
          );

        if (currentBlockTime !== null) {
          setBlockchainTime(currentBlockTime);
        }

        const effectiveBlockchainTime =
          currentBlockTime !== null
            ? currentBlockTime
            : Math.floor(Date.now() / 1000);

        console.log(
          "===== REFRESH BLOCKCHAIN TIME ====="
        );
        console.log(
          "CURRENT SLOT:",
          currentSlot
        );
        console.log(
          "BLOCKCHAIN TIME:",
          effectiveBlockchainTime
        );
        console.log(
          "BLOCKCHAIN TIME DATE:",
          new Date(
            effectiveBlockchainTime * 1000
          ).toISOString()
        );

        const provider =
          new AnchorProvider(
            connection,
            {
              publicKey:
                publicKey ||
                PublicKey.default,

              signTransaction:
                async (tx: any) => tx,

              signAllTransactions:
                async (txs: any[]) => txs,
            } as any,
            {
              commitment: "confirmed",
            }
          );

        const program =
          new Program(
            idlData as any,
            provider
          );

        /* ------------------------------------------------------
           POOL
        ------------------------------------------------------ */

        const pool: any =
          await (
            program.account as any
          )
            .stakingPool
            .fetchNullable(
              poolPda
            );

        let rewardIntervalSeconds = 86400;

        if (pool) {
          setPoolExists(true);

          rewardIntervalSeconds = Math.max(
            1,
            toNumber(
              pool.rewardIntervalSeconds ??
                pool.reward_interval_seconds ??
                86400
            )
          );

          console.log(
            "REWARD INTERVAL FROM POOL:",
            rewardIntervalSeconds,
            "seconds"
          );

          const onChainTokenMint =
            pool.tokenMint ??
            pool.token_mint ??
            KGSL_MINT;

          const onChainRewardMint =
            pool.rewardMint ??
            pool.reward_mint ??
            REWARD_MINT;

          setPoolTotal(
            tokenAmount(
              pool.totalStaked ??
                pool.total_staked ??
                0
            )
          );

          setPoolMint(
            new PublicKey(
              onChainTokenMint
            )
          );

          setRewardMint(
            new PublicKey(
              onChainRewardMint
            )
          );

          setPoolTreasury(
            pool.treasury
              ? new PublicKey(pool.treasury)
              : null
          );
        } else {
          setPoolExists(false);
          setPoolTotal(0);

          setPoolMint(
            KGSL_MINT
          );

          setRewardMint(
            REWARD_MINT
          );

          setPoolTreasury(null);
        }

        /* ------------------------------------------------------
           WALLET / MULTI-POSITION STAKE
        ------------------------------------------------------ */

        if (!publicKey) {
          setWalletBalance(0);
          setPositions([]);
          setStake({
            ...EMPTY_STAKE,
            pda: null,
          });
          return;
        }

        const mint =
          pool
            ? new PublicKey(
                pool.tokenMint ??
                  pool.token_mint ??
                  KGSL_MINT
              )
            : KGSL_MINT;

        const ownerAta =
          getAssociatedTokenAddressSync(
            mint,
            publicKey
          );

        const balance =
          await connection
            .getTokenAccountBalance(
              ownerAta
            )
            .catch(() => null);

        setWalletBalance(
          balance?.value?.uiAmount ?? 0
        );

        const rewardAta =
          getAssociatedTokenAddressSync(
            REWARD_MINT,
            publicKey
          );

        const rewardBalanceInfo =
          await connection
            .getTokenAccountBalance(
              rewardAta
            )
            .catch(() => null);

        setRewardBalance(
          rewardBalanceInfo?.value?.uiAmount ?? 0
        );

        /* ------------------------------------------------------
           CARI SEMUA POSISI WALLET
           SATU QUERY RPC, BUKAN POSITION 0-20
        ------------------------------------------------------ */

        console.log("===== BLOCKCHAIN TIME DEBUG =====");
        console.log("BLOCKCHAIN TIME:", blockchainTime);
        console.log(
          "BLOCKCHAIN TIME DATE:",
          blockchainTime > 0
            ? new Date(blockchainTime * 1000).toISOString()
            : "NOT AVAILABLE"
        );

        const foundPositions: (StakeState & {
          positionId: number;
        })[] = [];

        const stakeAccounts =
          await (
            program.account as any
          )
            .stakeAccount
            .all([
              {
                memcmp: {
                  offset: 8,
                  bytes: publicKey.toBase58(),
                },
              },
            ]);

        console.log(
          "STAKE ACCOUNTS FOUND:",
          stakeAccounts.length
        );

        for (const stakeEntry of stakeAccounts) {
          const currentStakePda =
            stakeEntry.publicKey;

          const account: any =
            stakeEntry.account;

          const currentPositionId =
            toNumber(
              account.positionId ??
                account.position_id
            );

          const amountRaw =
            toNumber(account.amount);

          const startTime =
            toNumber(
              account.startTime ??
                account.start_time
            );

          const unlockTime =
            toNumber(
              account.unlockTime ??
                account.unlock_time
            );

          const lastRewardTime =
            toNumber(
              account.lastRewardTime ??
                account.last_reward_time
            );

          /*
           * ======================================================
           * COMPOUND BALANCE FIXED-POINT
           * ======================================================
           *
           * Smart contract sekarang menyimpan:
           *
           * compound_balance_fp
           *
           * dengan precision RATE_PRECISION = 1e18.
           *
           * Frontend harus membaca field ini agar pecahan reward
           * tidak hilang akibat pembulatan u64.
           */

          const ratePrecision =
            1_000_000_000_000_000_000;

          const compoundBalanceFpRaw =
            toNumber(
              account.compoundBalanceFp ??
                account.compound_balance_fp ??
                0
            );

          /*
           * Posisi lama mungkin belum mempunyai
           * compound_balance_fp.
           *
           * Gunakan compound_balance sebagai fallback.
           */

          const compoundBalanceRaw =
            toNumber(
              account.compoundBalance ??
                account.compound_balance ??
                account.amount
            );

          const compoundBalanceFp =
            compoundBalanceFpRaw > 0
              ? compoundBalanceFpRaw
              : compoundBalanceRaw *
                ratePrecision;

          const rewardRateFp =
            toBigInt(
              account.rewardRateFp ??
                account.reward_rate_fp ??
                0
            );

          const now =
            effectiveBlockchainTime;

          const elapsed =
            Math.max(
              0,
              now - lastRewardTime
            );

          /*
           * ======================================================
           * DISPLAY REWARD
           * ======================================================
           *
           * Perhitungan frontend mengikuti konsep kontrak:
           *
           * reward per interval =
           * balance_fp * interval_rate / RATE_PRECISION
           *
           * Dengan cara ini frontend tidak memakai Math.pow()
           * sebagai sumber utama perhitungan reward.
           */

          /*
           * ======================================================
           * REWARD DISPLAY
           * ======================================================
           *
           * PENDING REWARD di frontend adalah indikator bahwa
           * reward sedang berjalan.
           *
           * Frontend refresh setiap 20 detik.
           *
           * PENDING REWARD dihitung kontinu berdasarkan waktu.
           *
           * CLAIM tetap mengikuti reward interval resmi Pool.
           *
           * Lock tetap mengikuti unlock_time.
           */

          const elapsedIntervals =
            Math.floor(
              elapsed /
                rewardIntervalSeconds
            );

          const remainingLockTime =
            Math.max(
              0,
              unlockTime -
                lastRewardTime
            );

          const remainingIntervals =
            Math.floor(
              remainingLockTime /
                rewardIntervalSeconds
            );

          /*
           * Interval resmi yang sudah selesai.
           *
           * Ini tetap digunakan untuk menentukan apakah
           * reward sudah boleh di-claim.
           */
          const rewardIntervals =
            Math.min(
              elapsedIntervals,
              remainingIntervals
            );

          /*
           * Reward display tidak boleh melewati unlock_time.
           */
          const elapsedForReward =
            Math.max(
              0,
              Math.min(
                elapsed,
                remainingLockTime
              )
            );

          let simulatedBalanceFp =
            compoundBalanceFp;

          /*
           * ======================================================
           * REWARD FIXED-POINT
           * ======================================================
           */

          const rewardRateFpBig =
            rewardRateFp;

          const rewardIntervalBig =
            BigInt(
              Math.max(
                0,
                Math.floor(
                  rewardIntervalSeconds
                )
              )
            );

          const ratePrecisionBig =
            BigInt(
              ratePrecision
            );

          let simulatedBalanceFpBig =
            toBigInt(
              compoundBalanceFp
            );

          /*
           * Rate per interval.
           *
           * Rate smart contract TIDAK diubah.
           */
          const intervalRateBig: bigint =
            rewardRateFpBig > BigInt(0) &&
            rewardIntervalBig > BigInt(0)
              ? (
                  rewardRateFpBig *
                  rewardIntervalBig
                ) /
                BigInt(86400)
              : BigInt(0);

          /*
           * ======================================================
           * CONTINUOUS DISPLAY REWARD
           * ======================================================
           *
           * Hanya untuk indikator PENDING REWARD di frontend.
           *
           * 20 detik -> display dapat berubah
           * 40 detik -> display dapat berubah
           * 60 detik -> display dapat berubah
           *
           * Claim tetap mengikuti rewardIntervals.
           */

          if (
            elapsedForReward > 0 &&
            rewardRateFpBig > BigInt(0)
          ) {
            const elapsedRewardFpBig =
              (
                simulatedBalanceFpBig *
                rewardRateFpBig *
                BigInt(
                  elapsedForReward
                )
              ) /
              (
                ratePrecisionBig *
                BigInt(86400)
              );

            simulatedBalanceFpBig +=
              elapsedRewardFpBig;
          }

          /*
           * Gunakan hasil continuous display.
           */
          simulatedBalanceFp =
            Number(
              simulatedBalanceFpBig
            ) /
            ratePrecision;

          /*
           * Reward baru dalam fixed-point.
           */

          const compoundBalanceFpBig =
            compoundBalanceFpRaw > 0
              ? toBigInt(compoundBalanceFpRaw)
              : toBigInt(compoundBalanceRaw) *
                BigInt("1000000000000000000");

          const accruedRewardFpBig =
            simulatedBalanceFpBig >
            compoundBalanceFpBig
              ? simulatedBalanceFpBig -
                compoundBalanceFpBig
              : BigInt(0);

          /*
           * Konversi ke raw token.
           * BigInt menjaga presisi u128 sampai tahap ini.
           */

          const accruedRewardRawBig =
            accruedRewardFpBig /
            ratePrecisionBig;

          const accruedRewardRaw =
            Number(
              accruedRewardRawBig
            );

          const position = {
            amount:
              tokenAmount(amountRaw),

            startTime,

            unlockTime,

            lastRewardTime,

            compoundBalance:
              tokenAmount(
                Number(
                  simulatedBalanceFpBig /
                    ratePrecisionBig
                )
              ),

            accruedReward:
              Math.max(
                0,
                Number(
                  simulatedBalanceFpBig /
                    ratePrecisionBig
                ) /
                  10 ** DECIMALS -
                  tokenAmount(amountRaw)
              ),

            /*
             * CLAIM mengikuti reward_interval_seconds
             * dari StakingPool, sama seperti smart contract.
             *
             * Localnet:
             *   60 detik = 1 interval claim
             *
             * Devnet/Mainnet:
             *   86400 detik = 1 hari
             */
            canClaim:
              rewardIntervals >= 1 &&
              accruedRewardRaw > 0,

            pda:
              currentStakePda,

            positionId:
              currentPositionId,
          };

          console.log("===== POSITION REWARD DEBUG =====");
          console.log("POSITION ID:", currentPositionId);
          console.log("AMOUNT:", position.amount);
          console.log("COMPOUND BALANCE:", position.compoundBalance);
          console.log("ACCRUED REWARD:", position.accruedReward);
          console.log("CAN CLAIM:", position.canClaim);
          console.log("REWARD RATE FP:", rewardRateFp);
          console.log("REWARD INTERVALS:", rewardIntervals);
          console.log("ACCRUED REWARD RAW:", accruedRewardRaw);

          foundPositions.push(
            position
          );



          console.log(
            "FOUND STAKE POSITION",
            {
              positionId:
                currentPositionId,
              pda:
                currentStakePda.toBase58(),
              amount:
                position.amount,
              unlockTime,
              rewardRateFp,
            }
          );
        }

        /* ------------------------------------------------------
           SIMPAN SEMUA POSISI
        ------------------------------------------------------ */

        setPositions(
          foundPositions
        );

        /* ------------------------------------------------------
           TOTAL SEMUA POSISI + PILIH POSISI AKTIF
        ------------------------------------------------------ */

        const totalActiveAmount =
          foundPositions.reduce(
            (total, position) =>
              total + position.amount,
            0
          );

        console.log(
          "TOTAL ACTIVE STAKE:",
          totalActiveAmount
        );

        setTotalActiveStake(
          totalActiveAmount
        );

        const selected =
          foundPositions.find(
            (x) =>
              x.positionId ===
              selectedPositionId
          );

        if (selected) {
          setStake(selected);

          setPositionId(
            selected.positionId
          );
        } else if (
          foundPositions.length > 0
        ) {
          const first =
            foundPositions[0];

          setSelectedPositionId(
            first.positionId
          );

          setPositionId(
            first.positionId
          );

          setStake(first);
        } else {
          setTotalActiveStake(0);

          setStake({
            ...EMPTY_STAKE,
            pda: null,
          });
        }

      } catch (e: any) {
        console.error(
          "FETCH ON-CHAIN ERROR",
          e
        );

        setError(
          e?.message ||
            String(e)
        );
      } finally {
        refreshingRef.current =
          false;
      }
    },
    [
      connection,
      publicKey,
      poolPda,
      selectedPositionId,
    ]
  );

  /* ==========================================================
     MOUNT
  ========================================================== */

  useEffect(() => {
    setMounted(true);

    const savedTheme =
      window.localStorage.getItem("kgsl-theme");

    setLightMode(
      savedTheme === "light"
    );

    const savedLanguage =
      window.localStorage.getItem("kgsl-language");

    if (
      savedLanguage === "id" ||
      savedLanguage === "en"
    ) {
      setLanguage(savedLanguage);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    document.documentElement.classList.toggle(
      "light-mode",
      lightMode
    );

    window.localStorage.setItem(
      "kgsl-theme",
      lightMode ? "light" : "dark"
    );

    window.localStorage.setItem(
      "kgsl-language",
      language
    );
  }, [lightMode, language, mounted]);

  /* ==========================================================
     AUTO REFRESH
  ========================================================== */

  useEffect(() => {
    if (!mounted) return;

    /*
     * Jangan melakukan query posisi sebelum wallet terhubung.
     * Setelah Phantom terhubung, refresh akan mengambil semua
     * StakeAccount milik wallet.
     */
    if (!publicKey) {
      return;
    }

    refresh();
    refreshReferral();

    const id =
      window.setInterval(
        () => {
          refresh();
          refreshReferral();
        },
        20000
      );

    return () => {
      window.clearInterval(id);
    };
  }, [
    mounted,
    publicKey,
    refresh,
    refreshReferral,
  ]);

  /* ==========================================================
     LOCK
  ========================================================== */

  const lockLabel =
    LOCKS.find(
      (x) =>
        x.days === lockDays
    )?.label ??
    `${lockDays} Hari`;

  /* ==========================================================
     STAKE
  ========================================================== */

  const doStake = async () => {
    if (!publicKey) {
      setError(
        "Hubungkan Phantom terlebih dahulu."
      );
      return;
    }

    if (!poolExists) {
      setError(
        "Staking Pool belum ditemukan."
      );
      return;
    }

    if (!amount) {
      setError(
        "Masukkan jumlah KGSL."
      );
      return;
    }

    if (
      Number(amount) <= 0
    ) {
      setError(
        "Jumlah KGSL harus lebih dari 0."
      );
      return;
    }

    if (
      !LOCKS.some(
        (x) =>
          x.days ===
          Number(lockDays)
      )
    ) {
      setError(
        "Lock period tidak valid."
      );
      return;
    }

    if (!stakePda) {
      setError(
        "Stake PDA tidak tersedia."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const program =
        getProgram();

      const token =
        tokensToBN(amount);

      console.log("========== STAKE AMOUNT DEBUG ==========");
      console.log("INPUT AMOUNT:", amount);
      console.log("DECIMALS:", DECIMALS);
      console.log("TOKEN RAW:", token.toString());
      console.log(
        "TOKEN UI:",
        Number(token.toString()) / 10 ** DECIMALS
      );
      console.log("========================================");

      /* ------------------------------------------------------
         OWNER ATA
      ------------------------------------------------------ */

      const ownerTokenAccount =
        getAssociatedTokenAddressSync(
          poolMint,
          publicKey
        );

      /* ------------------------------------------------------
         POOL ATA
         DIHITUNG OTOMATIS DARI POOL PDA + MINT
      ------------------------------------------------------ */

      const poolTokenAccount =
        getAssociatedTokenAddressSync(
          poolMint,
          poolPda,
          true
        );

      console.log(
        "========== STAKE =========="
      );

      console.log(
        "Program:",
        PROGRAM_ID.toBase58()
      );

      console.log(
        "Owner:",
        publicKey.toBase58()
      );

      console.log(
        "KGSL Mint:",
        poolMint.toBase58()
      );

      console.log(
        "Pool PDA:",
        poolPda.toBase58()
      );

      console.log(
        "Pool ATA:",
        poolTokenAccount.toBase58()
      );

      console.log(
        "Stake PDA:",
        stakePda.toBase58()
      );

      console.log(
        "Amount:",
        amount
      );

      console.log(
        "Lock:",
        lockDays
      );

      /* ------------------------------------------------------
         CHECK USER ATA
      ------------------------------------------------------ */

      const ownerAtaInfo =
        await connection.getAccountInfo(
          ownerTokenAccount
        );

      let createOwnerAtaIx:
        TransactionInstruction | null = null;

      if (!ownerAtaInfo) {
        createOwnerAtaIx =
          createAssociatedTokenAccountInstruction(
            publicKey,
            ownerTokenAccount,
            publicKey,
            poolMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

        console.log(
          "USER KGSL ATA BELUM ADA - AKAN DIBUAT OTOMATIS:",
          ownerTokenAccount.toBase58()
        );
      } else {
        console.log(
          "USER KGSL ATA SUDAH ADA:",
          ownerTokenAccount.toBase58()
        );
      }

      /* ------------------------------------------------------
         CHECK POOL ATA
      ------------------------------------------------------ */

      const poolAtaInfo =
        await connection.getAccountInfo(
          poolTokenAccount
        );

      if (!poolAtaInfo) {
        throw new Error(
          "Pool ATA tidak ditemukan:\n" +
          poolTokenAccount.toBase58()
        );
      }

      /* ------------------------------------------------------
         CHECK STAKE PDA

         Smart contract memakai INIT.
         Jadi frontend TIDAK membuat account.
      ------------------------------------------------------ */

      /* ------------------------------------------------------
         REFERRAL VALIDATION
      ------------------------------------------------------ */

      const requiredReferrals =
        Number(lockDays) === 7
          ? 0
          : Number(lockDays) === 15
          ? 3
          : Number(lockDays) === 30
          ? 6
          : Number(lockDays) === 60
          ? 10
          : Number(lockDays) === 120
          ? 20
          : -1;

      if (requiredReferrals < 0) {
        throw new Error(
          "Lock period tidak valid. Pilih 7, 15, 30, 60, atau 120 hari."
        );
      }

      /*
       * Untuk 7 hari referral tidak diperlukan.
       *
       * Untuk 15/30/60/120 hari:
       * - Referral Account user wajib ada.
       * - active_referrals harus memenuhi syarat.
       * - referrer_account harus ditemukan dari field referrer
       *   yang tersimpan on-chain.
       */

      let stakeReferralAccount: PublicKey | null = null;
      let stakeReferrerAccount: PublicKey | null = null;

      /*
       * REFERRAL TRACKING
       *
       * ReferralAccount tetap dikirim untuk semua lock period
       * jika wallet user sudah terdaftar.
       *
       * Untuk 7 hari:
       * - Tidak ada syarat jumlah referral.
       * - Referral tetap dicatat sebagai active stake.
       *
       * Untuk 15/30/60/120 hari:
       * - ReferralAccount wajib ada.
       * - active_referrals harus memenuhi syarat.
       * - referrer_account ditemukan dari field referrer on-chain.
       */

      if (referralPda) {
        const referralAccountData: any =
          await (program.account as any)
            .referralAccount
            .fetchNullable(referralPda);

        if (referralAccountData) {
          const referrerValue =
            referralAccountData.referrer ??
            referralAccountData.referrer;

          const hasReferrer =
            referrerValue &&
            !new PublicKey(
              referrerValue.toString()
            ).equals(PublicKey.default);

          /*
           * Untuk lock > 7 hari, referral wajib valid
           * dan jumlah active referral harus memenuhi syarat.
           */
          if (requiredReferrals > 0) {
            const active =
              toNumber(
                referralAccountData.activeReferrals ??
                  referralAccountData.active_referrals ??
                  0
              );

            if (active < requiredReferrals) {
              throw new Error(
                `Referral aktif belum cukup untuk lock ${lockDays} hari.\n\n` +
                `Dibutuhkan: ${requiredReferrals}\n` +
                `Referral aktif: ${active}`
              );
            }

            if (!hasReferrer) {
              throw new Error(
                "Referral Account belum mempunyai referrer yang valid."
              );
            }
          }

          /*
           * User ReferralAccount selalu dikirim untuk tracking.
           */
          stakeReferralAccount = referralPda;

          /*
           * ReferrerAccount hanya dikirim jika user memang
           * mempunyai referrer.
           *
           * ROOT tidak mempunyai referrer.
           */
          if (hasReferrer) {
            const referrerPubkey =
              new PublicKey(
                referrerValue.toString()
              );

            stakeReferrerAccount =
              PublicKey.findProgramAddressSync(
                [
                  Buffer.from("referral"),
                  referrerPubkey.toBuffer(),
                ],
                PROGRAM_ID
              )[0];

            console.log(
              "========== REFERRAL STAKE =========="
            );

            console.log(
              "Required referrals:",
              requiredReferrals
            );

            console.log(
              "Active referrals:",
              toNumber(
                referralAccountData.activeReferrals ??
                  referralAccountData.active_referrals ??
                  0
              )
            );

            console.log(
              "User referral PDA:",
              stakeReferralAccount.toBase58()
            );

            console.log(
              "Referrer:",
              referrerPubkey.toBase58()
            );

            console.log(
              "Referrer referral PDA:",
              stakeReferrerAccount.toBase58()
            );
          } else {
            console.log(
              "ROOT / NO REFERRER: tracking user referral only."
            );
          }
        } else if (requiredReferrals > 0) {
          throw new Error(
            `Lock ${lockDays} hari membutuhkan Referral Account. ` +
            `Daftarkan referral terlebih dahulu.`
          );
        }
      } else if (requiredReferrals > 0) {
        throw new Error(
          "Referral PDA wallet tidak tersedia."
        );
      }

      /* ------------------------------------------------------
         STAKE SMART CONTRACT
      ------------------------------------------------------ */

      /*
       * Cari Position ID kosong otomatis.
       *
       * Contoh:
       * Position 0 sudah terisi
       * Position 1 sudah terisi
       * Position 2 kosong
       *
       * Maka stake baru otomatis memakai Position 2.
       */

      const nextPositionId =
        await findNextAvailablePosition(
          program,
          publicKey
        );

      const actualStakePda =
        getStakePda(
          publicKey,
          nextPositionId
        );

      console.log(
        "========== NEW STAKE POSITION =========="
      );

      console.log(
        "NEXT POSITION ID:",
        nextPositionId
      );

      console.log(
        "STAKE PDA:",
        actualStakePda.toBase58()
      );

      console.log(
        "POSITION ID FROM STATE:",
        positionId
      );

      console.log(
        "========== MULTI POSITION DEBUG =========="
      );

      console.log(
        "POSITION ID:",
        positionId
      );

      console.log(
        "POSITION ID BN:",
        new BN(positionId).toString()
      );

      console.log(
        "STAKE PDA:",
        actualStakePda.toBase58()
      );

      console.log(
        "STAKE PDA FROM STATE:",
        stakePda?.toBase58()
      );

      console.log(
        "========== PDA FINAL CHECK =========="
      );

      console.log(
        "BROWSER OWNER:",
        publicKey.toBase58()
      );

      console.log(
        "PROGRAM ID:",
        PROGRAM_ID.toBase58()
      );

      console.log(
        "NEXT POSITION:",
        nextPositionId
      );

      console.log(
        "PDA SENT:",
        actualStakePda.toBase58()
      );

      console.log(
        "PDA RECOMPUTED:",
        getStakePda(
          publicKey,
          nextPositionId
        ).toBase58()
      );

      console.log(
        "PDA EQUAL:",
        actualStakePda.equals(
          getStakePda(
            publicKey,
            nextPositionId
          )
        )
      );

      if (!signTransaction) {
        throw new Error(
          "Wallet tidak menyediakan signTransaction."
        );
      }

      const stakeProvider =
        new AnchorProvider(
          connection,
          {
            publicKey,
            signTransaction,
            signAllTransactions:
              signAllTransactions ||
              (async (txs: any[]) => txs),
          } as any,
          {
            commitment: "confirmed",
          }
        );

      const stakeProgram =
        new Program(
          {
            ...(idlData as any),
            address: PROGRAM_ID.toBase58(),
          } as any,
          stakeProvider
        );

      console.log(
        "STAKE PROGRAM RUNTIME:",
        stakeProgram.programId.toBase58()
      );

      const stakeInstruction =
        await (stakeProgram.methods as any)
          .stake(
            token,
            Number(lockDays),
            new BN(nextPositionId)
          )
          .accounts({
            owner: publicKey,

            stakingPool:
              poolPda,

            stakeAccount:
              PublicKey.findProgramAddressSync(
                [
                  STAKE_SEED,
                  publicKey.toBuffer(),
                  new BN(nextPositionId).toArrayLike(
                    Buffer,
                    "le",
                    8
                  ),
                ],
                PROGRAM_ID
              )[0],

            referralAccount:
              stakeReferralAccount,

            referrerAccount:
              stakeReferrerAccount,

            ownerTokenAccount:
              ownerTokenAccount,

            poolTokenAccount:
              poolTokenAccount,

            tokenMint:
              poolMint,

            tokenProgram:
              TOKEN_PROGRAM_ID,

            systemProgram:
              SystemProgram.programId,
          })
          .instruction();

      const transaction =
        new Transaction();

      if (createOwnerAtaIx) {
        transaction.add(
          createOwnerAtaIx
        );
      }

      transaction.add(
        stakeInstruction
      );

      transaction.feePayer =
        publicKey;

      const latest =
        await connection.getLatestBlockhash(
          "confirmed"
        );

      transaction.recentBlockhash =
        latest.blockhash;

      console.log("========== FINAL BROWSER TX ==========");
      console.log("FEE PAYER:", transaction.feePayer?.toBase58());

      transaction.instructions.forEach((ix: any, i: number) => {
        console.log("IX", i, "PROGRAM:", ix.programId.toBase58());
        ix.keys.forEach((k: any, j: number) => {
          console.log(
            "  ACCOUNT",
            j,
            k.pubkey.toBase58(),
            "signer=" + k.isSigner,
            "writable=" + k.isWritable
          );
        });
      });

      console.log("STAKE STEP 1: MEMINTA SIGNATURE PHANTOM");

      const signedTransaction =
        await signTransaction(
          transaction
        );

      console.log(
        "STAKE STEP 2: TRANSAKSI SUDAH DITANDATANGANI"
      );

      const rawTransaction =
        signedTransaction.serialize();

      console.log(
        "STAKE STEP 3: SEND RAW TRANSACTION"
      );

      const sig =
        await connection.sendRawTransaction(
          rawTransaction,
          {
            skipPreflight: false,
            maxRetries: 3,
          }
        );

      console.log(
        "STAKE STEP 4: SIGNATURE DITERIMA:",
        sig
      );

      console.log(
        "STAKE STEP 5: CONFIRM TRANSACTION"
      );

      const confirmation =
        await Promise.race([
          connection.confirmTransaction(
            {
              signature: sig,
              blockhash: latest.blockhash,
              lastValidBlockHeight:
                latest.lastValidBlockHeight,
            },
            "confirmed"
          ),

          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Konfirmasi transaksi timeout 45 detik. Signature: " +
                    sig
                  )
                ),
              45_000
            )
          ),
        ]);

      console.log(
        "STAKE STEP 6: CONFIRMED:",
        confirmation
      );

      console.log(
        "STAKE SIGNATURE:",
        sig
      );

      const successfulStakeAmount = amount;

      setAmount("");

      setSuccessModal({
        title: "Stake berhasil!",
        message: `${lockLabel} berhasil dibuat.`,
        amount: `${successfulStakeAmount} KGSL`,
        signature: sig,
      });

      try {
        await refresh();
      } catch (refreshError) {
        console.warn(
          "STAKE REFRESH AFTER SUCCESS FAILED:",
          refreshError
        );
      }
    } catch (e: any) {
      console.error(
        "STAKE ERROR",
        e
      );

      if (e?.logs) {
        console.error(
          "ANCHOR LOGS:",
          e.logs
        );
      }

      setError(
        e?.message ||
          String(e)
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     CLAIM REWARD
  ========================================================== */

  const doClaim = async () => {
    if (!publicKey) {
      setError(
        "Hubungkan Phantom terlebih dahulu."
      );
      return;
    }

    if (!stakePda) {
      setError(
        "Stake PDA tidak tersedia."
      );
      return;
    }

    if (stake.amount <= 0) {
      setError(
        "Belum ada stake aktif."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!signTransaction) {
        throw new Error(
          "Wallet tidak menyediakan signTransaction."
        );
      }

      const program =
        getProgram();

      const ownerRewardAccount =
        getAssociatedTokenAddressSync(
          rewardMint,
          publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

      if (!poolTreasury) {
        throw new Error(
          "Treasury StakingPool tidak tersedia."
        );
      }

      const devRewardAccount =
        getAssociatedTokenAddressSync(
          rewardMint,
          poolTreasury
        );

      const rewardVault = new PublicKey(
        "DbTSS3ejMHCQTH6wt1ma5tygVWnQeSXg3JmipWFmBw7F"
      );

      /* ------------------------------------------------------
         CHECK REWARD VAULT
      ------------------------------------------------------ */

      const vaultInfo =
        await connection.getAccountInfo(
          rewardVault
        );

      if (!vaultInfo) {
        throw new Error(
          "Reward Vault belum dibuat.\n\n" +
          "Reward Vault:\n" +
          rewardVault.toBase58()
        );
      }

      /* ------------------------------------------------------
         CHECK USER REWARD ATA
      ------------------------------------------------------ */

      const ownerRewardAtaInfo =
        await connection.getAccountInfo(
          ownerRewardAccount
        );

      let createRewardAtaIx:
        TransactionInstruction | null = null;

      if (!ownerRewardAtaInfo) {
        createRewardAtaIx =
          createAssociatedTokenAccountInstruction(
            publicKey,
            ownerRewardAccount,
            publicKey,
            rewardMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

        console.log(
          "USER REWARD ATA BELUM ADA - AKAN DIBUAT OTOMATIS:",
          ownerRewardAccount.toBase58()
        );
      } else {
        console.log(
          "USER REWARD ATA SUDAH ADA:",
          ownerRewardAccount.toBase58()
        );
      }

      /* ------------------------------------------------------
         CLAIM REWARD INSTRUCTION
      ------------------------------------------------------ */

      const claimIx =
        await (program.methods as any)
          .claimReward(
            new BN(positionId)
          )
          .accounts({
            owner: publicKey,

            stakingPool:
              poolPda,

            stakeAccount:
              getStakePda(
                publicKey,
                positionId
              ),

            ownerRewardAccount:
              ownerRewardAccount,

            devRewardAccount:
              devRewardAccount,

            rewardVault:
              rewardVault,

            rewardMint:
              rewardMint,

            systemProgram:
              SystemProgram.programId,

            associatedTokenProgram:
              ASSOCIATED_TOKEN_PROGRAM_ID,

            tokenProgram:
              TOKEN_PROGRAM_ID,
          })
          .instruction();

      /* ------------------------------------------------------
         SATU TRANSAKSI:
         CREATE REWARD ATA + CLAIM
      ------------------------------------------------------ */

      const transaction =
        new Transaction();

      if (createRewardAtaIx) {
        transaction.add(
          createRewardAtaIx
        );
      }

      transaction.add(
        claimIx
      );

      transaction.feePayer =
        publicKey;

      const latest =
        await connection.getLatestBlockhash(
          "confirmed"
        );

      transaction.recentBlockhash =
        latest.blockhash;

      const signedTransaction =
        await signTransaction(
          transaction
        );

      const sig =
        await connection.sendRawTransaction(
          signedTransaction.serialize(),
          {
            skipPreflight: false,
          }
        );

      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash:
            latest.blockhash,
          lastValidBlockHeight:
            latest.lastValidBlockHeight,
        },
        "confirmed"
      );

      console.log(
        "CLAIM SIGNATURE:",
        sig
      );

      await refresh();

      setSuccessModal({
        title: "Reward berhasil diklaim!",
        message: "Transaksi berhasil diproses di Solana Devnet.",
        amount: `${stake.accruedReward.toFixed(6)} KGSL`,
        signature: sig,
      });
    } catch (e: any) {
      console.error(
        "CLAIM ERROR",
        e
      );

      if (e?.logs) {
        console.error(
          "ANCHOR LOGS:",
          e.logs
        );
      }

      setError(
        e?.message ||
          String(e)
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     UNSTAKE
  ========================================================== */

  const doUnstake = async () => {
    if (!publicKey) {
      setError(
        "Hubungkan Phantom terlebih dahulu."
      );
      return;
    }

    if (!stakePda) {
      setError(
        "Stake PDA tidak tersedia."
      );
      return;
    }

    if (stake.amount <= 0) {
      setError(
        "Tidak ada stake aktif."
      );
      return;
    }

    const now =
      blockchainTime > 0
        ? blockchainTime
        : Math.floor(Date.now() / 1000);

    if (
      stake.unlockTime > now
    ) {
      setError(
        `Stake masih terkunci sampai ${new Date(
          stake.unlockTime * 1000
        ).toLocaleString()}`
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!signTransaction) {
        throw new Error(
          "Wallet tidak menyediakan signTransaction."
        );
      }

      const provider =
        new AnchorProvider(
          connection,
          {
            publicKey,
            signTransaction,
            signAllTransactions:
              signAllTransactions ||
              (async (txs: any[]) => txs),
          } as any,
          {
            commitment: "confirmed",
          }
        );

      const program =
        new Program(
          {
            ...(idlData as any),
            address: PROGRAM_ID.toBase58(),
          } as any,
          provider
        );

      console.log(
        "UNSTAKE PROGRAM RUNTIME:",
        program.programId.toBase58()
      );

      /* ======================================================
         REWARD ACCOUNTS
      ====================================================== */

      const ownerRewardAccount =
        getAssociatedTokenAddressSync(
          rewardMint,
          publicKey
        );

      console.log(
        "UNSTAKE OWNER:",
        publicKey.toBase58()
      );

      console.log(
        "UNSTAKE REWARD MINT:",
        rewardMint.toBase58()
      );

      console.log(
        "UNSTAKE OWNER REWARD ACCOUNT:",
        ownerRewardAccount.toBase58()
      );

      console.log(
        "UNSTAKE TOKEN PROGRAM:",
        TOKEN_PROGRAM_ID.toBase58()
      );

      console.log(
        "UNSTAKE ATA ONCHAIN OWNER:",
        (
          await connection.getAccountInfo(
            ownerRewardAccount
          )
        )?.owner.toBase58()
      );

      const devRewardAccount =
        getAssociatedTokenAddressSync(
          rewardMint,
          DEV_WALLET
        );

      const rewardVault =
        new PublicKey(
          "DbTSS3ejMHCQTH6wt1ma5tygVWnQeSXg3JmipWFmBw7F"
        );

      console.log("=== UNSTAKE ACCOUNT DEBUG ===");
      console.log(
        "OWNER:",
        publicKey.toBase58()
      );
      console.log(
        "OWNER REWARD:",
        ownerRewardAccount.toBase58()
      );
      console.log(
        "DEV REWARD:",
        devRewardAccount.toBase58()
      );
      console.log(
        "REWARD VAULT:",
        rewardVault.toBase58()
      );
      const rewardVaultInfo =
        await connection.getAccountInfo(
          rewardVault
        );

      if (!rewardVaultInfo) {
        throw new Error(
          "Reward Vault belum dibuat.\n\n" +
          `Reward Vault:\n${rewardVault.toBase58()}`
        );
      }

      /* ======================================================
         PRINCIPAL ACCOUNTS
      ====================================================== */

      const ownerTokenAccount =
        getAssociatedTokenAddressSync(
          poolMint,
          publicKey
        );

      const poolTokenAccount =
        new PublicKey(
          "DbTSS3ejMHCQTH6wt1ma5tygVWnQeSXg3JmipWFmBw7F"
        );

      const poolAtaInfo =
        await connection.getAccountInfo(
          poolTokenAccount
        );

      if (!poolAtaInfo) {
        throw new Error(
          "Pool ATA tidak ditemukan."
        );
      }

      console.log("=== UNSTAKE ACCOUNT DEBUG ===");
      console.log(
        "OWNER:",
        publicKey.toBase58()
      );
      console.log(
        "OWNER REWARD:",
        ownerRewardAccount.toBase58()
      );
      console.log(
        "DEV REWARD:",
        devRewardAccount.toBase58()
      );
      console.log(
        "REWARD VAULT:",
        rewardVault.toBase58()
      );
      console.log(
        "POOL TOKEN:",
        poolTokenAccount.toBase58()
      );
      console.log(
        "OWNER TOKEN:",
        ownerTokenAccount.toBase58()
      );
      console.log("=== END DEBUG ===");

      /* ======================================================
         FINAL REWARD DITANGANI SMART CONTRACT UNSTAKE
         
         Unstake menghitung reward terakhir, termasuk
         compounding, lalu membayar 75% user dan 25% dev.
      ====================================================== */

      /* ======================================================
         INSTRUCTION 2
         UNSTAKE PRINCIPAL
      ====================================================== */

      const unstakeIx =
        await (program.methods as any)
          .unstake(
            new BN(positionId)
          )
          .accounts({
            owner: publicKey,

            stakingPool:
              poolPda,

            stakeAccount:
              getStakePda(
                publicKey,
                positionId
              ),

            referralAccount:
              null,

            referrerAccount:
              null,

            ownerTokenAccount:
              ownerTokenAccount,

            poolTokenAccount:
              poolTokenAccount,

            tokenMint:
              poolMint,

            ownerRewardAccount:
              ownerRewardAccount,

            devRewardAccount:
              devRewardAccount,

            rewardVault:
              rewardVault,

            rewardMint:
              rewardMint,

            systemProgram:
              SystemProgram.programId,

            associatedTokenProgram:
              ASSOCIATED_TOKEN_PROGRAM_ID,

            tokenProgram:
              TOKEN_PROGRAM_ID,
          })
          .instruction();

      /* ======================================================
         SATU TRANSAKSI
      ====================================================== */

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash(
          "confirmed"
        );

      const transaction =
        new Transaction({
          feePayer:
            publicKey,
          recentBlockhash:
            blockhash,
        }).add(
          unstakeIx
        );

      const signedTransaction =
        await signTransaction(
          transaction
        );

      const sig =
        await connection.sendRawTransaction(
          signedTransaction.serialize(),
          {
            skipPreflight: false,
          }
        );

      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      console.log(
        "UNSTAKE + FINAL REWARD SIGNATURE:",
        sig
      );

      await refresh();

      setSuccessModal({
        title: "Unstake berhasil!",
        message: "Reward final otomatis dibayarkan dan principal dikembalikan.",
        signature: sig,
      });
    } catch (e: any) {
      console.error(
        "UNSTAKE + REWARD ERROR",
        e
      );

      if (e?.logs) {
        console.error(
          "ANCHOR LOGS:",
          e.logs
        );
      }

      setError(
        e?.message ||
          String(e)
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================
     MOUNT
  ========================================================== */

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center">

      {/* =========================================================
          SUCCESS MODAL
      ========================================================= */}

      {successModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setSuccessModal(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-[#d4af37]/60 bg-[#0b0a08] shadow-2xl shadow-black/70"
            onClick={(e) => e.stopPropagation()}
          >

            {/* SUCCESS ICON */}
            <div className="px-6 pt-8 text-center">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400/70 bg-emerald-400/10 shadow-lg shadow-emerald-500/10">
                <span className="text-4xl font-black text-emerald-400">
                  ✓
                </span>
              </div>

              <h2 className="mt-5 text-2xl font-black text-[#f5d76e]">
                {successModal.title}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {successModal.message}
              </p>

            </div>

            {/* DIVIDER */}
            <div className="mx-6 mt-6 border-t border-white/10" />

            {/* AMOUNT */}
            {successModal.amount && (
              <div className="mx-6 mt-5 rounded-2xl border border-[#d4af37]/20 bg-[#12100b] p-5 text-center">

                <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500">
                  {successModal.title.toLowerCase().includes("reward")
                    ? "REWARD DITERIMA"
                    : "JUMLAH TRANSAKSI"}
                </div>

                <div className="mt-2 text-2xl font-black text-emerald-400">
                  {successModal.amount}
                </div>

                <div className="mt-1 text-[10px] text-slate-500">
                  KING SULAIMAN TOKEN
                </div>

              </div>
            )}

            {/* TRANSACTION */}
            <div className="mx-6 mt-4 rounded-2xl border border-white/10 bg-[#10100d] p-4">

              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-500">
                TRANSACTION SIGNATURE
              </div>

              <div className="mt-2 flex items-start gap-2">

                <div className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-slate-300">
                  {successModal.signature}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        successModal.signature
                      );
                    } catch {}
                  }}
                  className="shrink-0 rounded-lg border border-[#d4af37]/30 px-2.5 py-2 text-[#d4af37] transition hover:bg-[#d4af37]/10"
                  title="Copy transaction"
                >
                  ⧉
                </button>

              </div>

            </div>

            {/* SOLSCAN */}
            <div className="px-6 pt-5">

              <a
                href={`https://solscan.io/tx/${successModal.signature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#b88a20] to-[#f0cf55] py-3.5 text-sm font-black text-black transition hover:brightness-110"
              >
                LIHAT DI SOLSCAN ↗
              </a>

            </div>

            {/* CLOSE */}
            <div className="px-6 py-5 text-center">

              <button
                type="button"
                onClick={() => setSuccessModal(null)}
                className="text-sm font-bold text-[#d4af37] transition hover:text-[#f5d76e]"
              >
                TUTUP
              </button>

            </div>

          </div>
        </div>
      )}




        <div className="text-center">
          <div className="text-3xl font-black kgsl-gradient-text">
            KING SULAIMAN
          </div>
          <div className="mt-2 text-sm text-zinc-500">
            Loading KGSL Staking...
          </div>
        </div>
      </main>
    );
  }

  const locked =
    stake.unlockTime >
    (
      blockchainTime > 0
        ? blockchainTime
        : Math.floor(Date.now() / 1000)
    );

  // Reward periode terpilih menggunakan rumus yang sama
  // dengan kartu DAILY COMPOUNDING di bawah.
  const selectedRateFpMap: Record<number, number> = {
    7: 5618684953663022,
    15: 5143920841621519,
    30: 26630327103109640,
    60: 21098882129842568,
    120: 12612857826115098,
  };

  const selectedRateFp =
    selectedRateFpMap[lockDays] ??
    selectedRateFpMap[7];

  const selectedCompoundReward =
    (
      Math.pow(
        1 +
          selectedRateFp /
            1_000_000_000_000_000_000,
        lockDays
      ) -
      1
    ) * 100;

  const selectedReward =
    `+${selectedCompoundReward.toFixed(2)}%`;

  const unlockText = stake.unlockTime
    ? new Date(stake.unlockTime * 1000).toLocaleString("id-ID")
    : "-";

  const remainingSeconds = stake.unlockTime
    ? Math.max(
        0,
        stake.unlockTime -
          (
            blockchainTime > 0
              ? blockchainTime
              : Math.floor(Date.now() / 1000)
          )
      )
    : 0;

  const remainingDays = Math.floor(
    remainingSeconds / 86400
  );

  const remainingHours = Math.floor(
    (remainingSeconds % 86400) / 3600
  );

  const remainingMinutes = Math.floor(
    (remainingSeconds % 3600) / 60
  );

  const t = TEXT[language];

  return (
    <main className="kgsl-mobile-page min-h-screen bg-[#050505] text-white px-4 py-5 md:px-8 md:py-8">
      <div className="fixed right-4 top-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() =>
            setLanguage((value) =>
              value === "id" ? "en" : "id"
            )
          }
          className="rounded-xl border border-[#d4af37]/40 bg-black/70 px-3 py-2 text-xs font-black text-[#f5d76e] shadow-lg backdrop-blur transition hover:bg-black"
        >
          {language === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}
        </button>

        <button
          type="button"
          onClick={() => setLightMode((value) => !value)}
          className="rounded-xl border border-[#d4af37]/40 bg-black/70 px-4 py-2 text-xs font-black text-[#f5d76e] shadow-lg backdrop-blur transition hover:bg-black"
        >
          {lightMode ? "☀️ LIGHT" : "🌙 DARK"}
        </button>
      </div>
      <div className="mx-auto max-w-7xl space-y-5">

        {/* =====================================================
            HEADER
        ===================================================== */}
        <header className="kgsl-card kgsl-glow px-5 py-4 md:px-7 md:py-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-2xl border border-[#d4af37]/40 bg-black shadow-[0_0_30px_rgba(212,175,55,.12)]">
                <img
                  src="/kgsl-logo.png"
                  alt="KGSL"
                  className="h-full w-full object-cover"
                />
              </div>

              <div>
                <div className="text-xs font-bold tracking-[0.28em] text-[#d4af37]">
                  KGSL ECOSYSTEM
                </div>

                <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                  KING <span className="kgsl-gradient-text">SULAIMAN</span>
                </h1>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>KGSL Staking Protocol</span>
                  <span className="text-zinc-700">•</span>

                  <span className="kgsl-status">
                    <span className="kgsl-status-dot kgsl-pulse" />
                    SOLANA DEVNET
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href="/calculator"
                target="_blank"
                rel="noopener noreferrer"
                className="wallet-adapter-button wallet-adapter-button-trigger"
              >
                REWARD CALCULATOR
              </a>

              <WalletMultiButton />
            </div>
          </div>
        </header>

        {/* =====================================================
            ERROR
        ===================================================== */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            <div className="font-black text-red-400">
              TRANSACTION / RPC ERROR
            </div>

            <div className="mt-2 whitespace-pre-wrap break-words">
              {error}
            </div>
          </div>
        )}

        {/* =====================================================
            STATS
        ===================================================== */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            title="TOTAL VALUE LOCKED"
            value={poolTotal}
            suffix="KGSL"
            language={language}
          />

          <Stat
            title="YOUR ACTIVE STAKE"
            value={totalActiveStake}
            suffix="KGSL"
            language={language}
          />

          <div>
            <Stat
              title={t.wallet}
              value={Math.floor(walletBalance)}
              suffix="KGSL"
              language={language}
            />

          </div>

          <Stat
            title={t.pendingReward}
            value={totalPendingReward}
            suffix="KGSL"
            language={language}
            decimals={3}
          />


        </section>

        {/* =====================================================
            REWARD OVERVIEW
        ===================================================== */}
        <section className="kgsl-card p-5 md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
                {language === "id"
                  ? "COMPOUNDING HARIAN"
                  : "DAILY COMPOUNDING"}
              </div>

              <h2 className="mt-1 text-xl font-black md:text-2xl">
                {language === "id"
                  ? "Reward Staking KGSL"
                  : "KGSL Staking Rewards"}
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                {language === "id"
                  ? "Perkiraan reward berdasarkan periode lock."
                  : "Estimated reward based on the lock period."}
              </p>
            </div>

            <div className="rounded-xl border border-[#d4af37]/20 bg-[#d4af37]/5 px-4 py-2 text-right">
              <div className="text-[10px] text-zinc-500">
                {language === "id"
                  ? "PERIODE TERPILIH"
                  : "SELECTED PERIOD"}
              </div>
              <div className="font-black text-[#f5d76e]">
                {lockDays} {language === "id" ? "HARI" : "DAYS"} • {selectedReward}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
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
            ].map((item) => {
              const compoundReward =
                (
                  Math.pow(
                    1 +
                      item.rateFp /
                        1_000_000_000_000_000_000,
                    item.days
                  ) -
                  1
                ) * 100;

              const reward =
                `+${compoundReward.toFixed(2)}%`;

              return (
              <button
                key={item.days}
                type="button"
                onClick={() => setLockDays(item.days)}
                disabled={loading}
                className={`rounded-2xl border p-4 text-center transition ${
                  lockDays === item.days
                    ? "kgsl-lock-active"
                    : "kgsl-lock"
                }`}
              >
                <div className="text-xs font-bold text-zinc-400">
                  {item.days} {language === "id" ? "HARI" : "DAYS"}
                </div>

                <div className="mt-2 text-lg font-black text-[#f5d76e]">
                  {reward}
                </div>

                <div className="mt-1 text-[9px] text-zinc-600">
                  {language === "id"
                    ? "COMPOUNDING HARIAN"
                    : "DAILY COMPOUNDING"}
                </div>
              </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap justify-between gap-2 text-[10px] text-zinc-600">
            <span>
              {language === "id"
                ? "Target: hingga 300% dalam 120 hari"
                : "Target: up to 300% in 120 days"}
            </span>
            <span>
              {language === "id"
                ? "Biaya Dev: 25%"
                : "Dev Fee: 25%"}
            </span>
            <span>
              {language === "id"
                ? "Reward bukan jaminan keuntungan"
                : "Rewards are not guaranteed returns"}
            </span>
          </div>
        </section>

        {/* =====================================================
            MAIN STAKING
        ===================================================== */}
        <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">

          {/* STAKE PANEL */}
          <div className="kgsl-card kgsl-glow p-5 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
                  {language === "id" ? "STAKING" : "STAKING"}
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  {language === "id"
                    ? "Stake KGSL"
                    : "Stake KGSL"}
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  {language === "id"
                    ? "Lock KGSL dan dapatkan reward melalui compounding harian."
                    : "Lock KGSL and earn rewards through daily compounding."}
                </p>
              </div>

              <div
                className={`rounded-xl px-3 py-2 shrink-0 whitespace-nowrap text-[10px] font-black ${
                  poolExists
                    ? "border border-green-500/20 bg-green-500/10 text-green-400"
                    : "border border-red-500/20 bg-red-500/10 text-red-400"
                }`}
              >
                {poolExists
                  ? language === "id"
                    ? "POOL AKTIF"
                    : "POOL ACTIVE"
                  : language === "id"
                    ? "POOL TIDAK DITEMUKAN"
                    : "POOL NOT FOUND"}
              </div>
            </div>

            {/* AMOUNT */}
            <div className="mt-7">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <label className="text-xs font-bold tracking-wider text-zinc-400">
                  {language === "id"
                    ? "JUMLAH YANG DI-STAKE"
                    : "AMOUNT TO STAKE"}
                </label>

                <span className="text-xs text-zinc-600">
                  {language === "id" ? "Saldo:" : "Balance:"}{" "}
                  {walletBalance.toLocaleString(
                    language === "id" ? "id-ID" : "en-US",
                    {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 6,
                    }
                  )} KGSL
                </span>
              </div>

              <div className="relative mt-2">
                <input
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value)
                  }
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="kgsl-input w-full px-4 py-4 pr-20 text-lg font-bold"
                />

                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-[#d4af37]">
                  KGSL
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAmount(
                    String(walletBalance)
                  )
                }
                disabled={
                  !publicKey ||
                  walletBalance <= 0 ||
                  loading
                }
                className="mt-2 text-xs font-bold text-[#d4af37] hover:text-[#f5d76e] disabled:opacity-30"
              >
                {language === "id"
                  ? "GUNAKAN SALDO MAKSIMAL"
                  : "USE MAX BALANCE"}
              </button>
            </div>

            {/* LOCK */}
            <div className="mt-6">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <label className="text-xs font-bold tracking-wider text-zinc-400">
                  {language === "id"
                    ? "PERIODE LOCK"
                    : "LOCK PERIOD"}
                </label>

                <span className="text-xs font-black text-[#f5d76e]">
                  {lockDays} {language === "id" ? "HARI" : "DAYS"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-5 gap-2">
                {LOCKS.map((item) => (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() =>
                      setLockDays(item.days)
                    }
                    disabled={loading}
                    className={`py-3 text-xs font-black ${
                      lockDays === item.days
                        ? "kgsl-lock-active"
                        : "kgsl-lock"
                    }`}
                  >
                    {item.days}D
                  </button>
                ))}
              </div>
            </div>

            {/* SELECTED REWARD */}
            <div className="mt-5 rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="text-xs text-zinc-500">
                  {language === "id"
                    ? "ESTIMASI REWARD"
                    : "ESTIMATED REWARD"}
                </span>

                <span className="text-xl font-black text-[#f5d76e]">
                  {selectedReward}
                </span>
              </div>

              <div className="mt-2 text-[10px] text-zinc-600">
                {language === "id"
                  ? "Berdasarkan periode lock yang dipilih dan compounding harian."
                  : "Based on the selected lock period and daily compounding."}
              </div>
            </div>

            {/* STAKE */}
            <button
              type="button"
              onClick={doStake}
              disabled={
                loading ||
                !publicKey ||
                !amount ||
                Number(amount) <= 0 ||
                !poolExists
              }
              className="kgsl-button mt-5 w-full py-4 text-sm"
            >
              {loading
                ? "PROCESSING TRANSACTION..."
                : `${language === "id" ? "STAKE" : "STAKE"} ${lockDays} ${
                    language === "id" ? "HARI" : "DAYS"
                  }`}
            </button>

            <div className="mt-4 text-center text-[10px] text-zinc-600">
              {language === "id"
                ? "Hubungkan wallet terlebih dahulu untuk melakukan staking."
                : "Connect your wallet first to start staking."}
            </div>
          </div>

          {/* POSITION PANEL */}
          <div className="kgsl-card p-5 md:p-7">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
                  {language === "id"
                    ? "POSISI ANDA"
                    : "YOUR POSITION"}
                </div>

                <h2 className="mt-1 text-2xl font-black">
                  {language === "id"
                    ? "Posisi Staking"
                    : "Staking Position"}
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  {language === "id"
                    ? "Data dibaca langsung dari StakeAccount."
                    : "Data is read directly from StakeAccount."}
                </p>
              </div>

              {stake.amount > 0 && (
                <div
                  className={`rounded-xl px-3 py-2 shrink-0 whitespace-nowrap text-[10px] font-black ${
                    locked
                      ? "border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#f5d76e]"
                      : "border border-green-500/30 bg-green-500/10 text-green-400"
                  }`}
                >
                  {
  locked
    ? language === "id"
      ? "TERKUNCI"
      : "LOCKED"
    : language === "id"
      ? "TERBUKA"
      : "UNLOCKED"
}
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <PositionCard
                label={t.staked}
                value={`${formatToken(stake.amount, language)} KGSL`}
              />

              <PositionCard
                label={t.compoundBalance}
                value={`${formatToken(stake.compoundBalance, language, 3)} KGSL`}
              />

              <PositionCard
                label={t.accruedReward}
                value={`${formatToken(stake.accruedReward, language, 3)} KGSL`}
                gold
              />

              <PositionCard
                label={t.lockStatus}
                value={
                  stake.amount > 0
                    ? locked
                      ? `${remainingDays}D ${remainingHours}H ${remainingMinutes}M`
                      : language === "id"
                        ? "SIAP UNSTAKE"
                        : "READY TO UNSTAKE"
                    : "-"
                }
              />
            </div>

            <div className="mt-4">
              <InfoDark
                label={
  language === "id"
    ? "MULAI"
    : "START"
}
                value={
                  stake.startTime
                    ? new Date(
                        stake.startTime * 1000
                      ).toLocaleString("id-ID")
                    : "-"
                }
              />

              <InfoDark
                label="UNLOCK"
                value={unlockText}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={doClaim}
                disabled={
                  loading ||
                  !publicKey ||
                  stake.amount <= 0 ||
                  !stake.canClaim
                }
                className="kgsl-button py-3 text-xs"
              >
                {loading
                  ? language === "id"
                    ? "MEMPROSES..."
                    : "PROCESSING..."
                  : language === "id"
                    ? "KLAIM REWARD"
                    : "CLAIM REWARD"}
              </button>

              <button
                type="button"
                onClick={doUnstake}
                disabled={
                  loading ||
                  !publicKey ||
                  stake.amount <= 0 ||
                  locked
                }
                className="rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-xs font-black text-red-300 transition hover:bg-red-500/20 disabled:opacity-30"
              >
                {locked ? "LOCKED" : "UNSTAKE"}
              </button>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-bold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
            >
              {language === "id"
  ? "SEGARKAN DATA ON-CHAIN"
  : "REFRESH ON-CHAIN DATA"}
            </button>
          </div>
        </section>

        {/* =====================================================
            MULTI POSITION LIST
        ===================================================== */}

        {positions.length > 0 && (
          <section className="kgsl-card p-5 md:p-7">
            <div className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
              {language === "id"
                ? "POSISI STAKING ANDA"
                : "YOUR STAKING POSITIONS"}
            </div>

            <div className="mt-1 text-sm text-zinc-500">
              {language === "id"
                ? "Pilih posisi untuk melihat reward, Klaim atau Unstake."
                : "Select a position to view rewards, Claim or Unstake."}
            </div>

            <div className="mt-5 grid gap-3">
              {positions.map((item: any) => {
                const isSelected =
                  item.positionId ===
                  selectedPositionId;

                const isLocked =
                  item.unlockTime >
                  (
                    blockchainTime > 0
                      ? blockchainTime
                      : Math.floor(Date.now() / 1000)
                  );

                return (
                  <button
                    key={item.positionId}
                    type="button"
                    onClick={() => {
                      setSelectedPositionId(
                        item.positionId
                      );

                      setPositionId(
                        item.positionId
                      );

                      setStake(item);
                    }}
                    className={`w-full max-w-full min-w-0 overflow-hidden rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-[#d4af37]/60 bg-[#d4af37]/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1 max-w-full">
                        <div className="text-sm font-black text-white">
                          {language === "id"
                            ? `Posisi #${item.positionId}`
                            : `Position #${item.positionId}`}
                        </div>

                        <div className="mt-1 min-w-0 break-all text-xs text-zinc-500">
                          {item.pda?.toBase58?.() ?? "-"}
                        </div>
                      </div>

                      <div
                        className={`w-fit max-w-full shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black ${
                          isLocked
                            ? "bg-yellow-500/10 text-yellow-300"
                            : "bg-green-500/10 text-green-300"
                        }`}
                      >
                        {isLocked
                          ? language === "id"
                            ? "TERKUNCI"
                            : "LOCKED"
                          : language === "id"
                            ? "TERBUKA"
                            : "UNLOCKED"}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div>
                        <div className="text-[10px] text-zinc-600">
                          {language === "id"
                            ? "DI-STAKE"
                            : "STAKED"}
                        </div>
                        <div className="mt-1 text-sm font-bold text-white">
                          {formatToken(item.amount, language)} KGSL
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-zinc-600">
                          {language === "id"
                            ? "COMPOUND"
                            : "COMPOUND"}
                        </div>
                        <div className="mt-1 text-sm font-bold text-white">
                          {formatToken(item.compoundBalance, language, 3)} KGSL
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-zinc-600">
                          {language === "id"
                            ? "TERKUMPUL"
                            : "ACCRUED"}
                        </div>
                        <div className="mt-1 text-sm font-bold text-[#d4af37]">
                          +{formatToken(item.accruedReward, language, 3)} KGSL
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-zinc-600">
                          {language === "id"
                            ? "UNLOCK"
                            : "UNLOCK"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-white">
                          {item.unlockTime
                            ? new Date(
                                item.unlockTime * 1000
                              ).toLocaleDateString(
                                "id-ID"
                              )
                            : "-"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* =====================================================
            REFERRAL
        ===================================================== */}
        <section className="kgsl-card p-5 md:p-7">
          <div className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
            {t.referralProgram}
          </div>

          <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black">
                {t.unlockHigher}
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                {language === "id"
                  ? "Referral aktif membantu membuka periode lock yang lebih tinggi."
                  : "Active referrals help unlock higher lock periods."}
              </p>
            </div>

            <div className="text-xs text-zinc-600">
              {language === "id"
                ? "TINGKAT REFERRAL AKTIF"
                : "ACTIVE REFERRAL TIERS"}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              {
                count: 3,
                days: 15,
              },
              {
                count: 6,
                days: 30,
              },
              {
                count: 10,
                days: 60,
              },
              {
                count: 20,
                days: 120,
              },
            ].map((item) => {
              const unlocked =
                activeReferrals >= item.count;

              return (
                <div
                  key={item.count}
                  className={`rounded-2xl border p-5 ${
                    unlocked
                      ? "border-[#d4af37]/40 bg-[#d4af37]/10"
                      : "border-[#d4af37]/15 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-black text-[#f5d76e]">
                        {item.count}
                      </div>

                      <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                        {language === "id"
                          ? "REFERRAL AKTIF"
                          : "ACTIVE REFERRALS"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-black">
                        {item.days}D
                      </div>

                      <div className="text-[10px] text-zinc-500">
                        LOCK
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-4 rounded-xl px-3 py-2 text-center text-xs font-black ${
                      unlocked
                        ? "border border-green-500/40 bg-green-500/10 text-green-400"
                        : "border border-white/10 bg-black/20 text-zinc-500"
                    }`}
                  >
                    {unlocked
                      ? `✓ ${language === "id" ? "BUKA" : "UNLOCK"} ${
                          item.days
                        } ${language === "id" ? "HARI" : "DAYS"}`
                      : `🔒 ${
                          item.count - activeReferrals
                        } ${
                          language === "id"
                            ? "REFERRAL LAGI"
                            : "MORE REFERRALS"
                        }`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* {t.myReferral} */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d4af37]/15 bg-white/[0.02] p-5">
              <div className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
                {t.myReferral}
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                  {t.referralCode}
                </div>

                <div className="mt-1 break-all text-lg font-black text-[#f5d76e]">
                  {myReferralCode ||
                    (language === "id"
                      ? "BELUM TERDAFTAR"
                      : "NOT REGISTERED")}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                  {language === "id"
                    ? "REFERRAL AKTIF"
                    : "ACTIVE REFERRALS"}
                </div>

                <div className="mt-1 text-3xl font-black">
                  {activeReferrals}
                </div>
              </div>

              {myReferralCode && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold tracking-wider text-zinc-500">
                    {t.referralLink}
                  </div>

                  <div className="mt-2 break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-zinc-400">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/?ref=${encodeURIComponent(
                          myReferralCode
                        )}`
                      : ""}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!myReferralCode) return;

                      const link =
                        `${window.location.origin}/?ref=${encodeURIComponent(
                          myReferralCode
                        )}`;

                      try {
                        await navigator.clipboard.writeText(
                          link
                        );

                        alert(
                          language === "id"
                            ? "Link referral berhasil disalin."
                            : "Referral link copied successfully."
                        );
                      } catch {
                        setError(
                          language === "id"
                            ? "Gagal menyalin link referral."
                            : "Failed to copy referral link."
                        );
                      }
                    }}
                    className="mt-2 w-full rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 py-2 shrink-0 whitespace-nowrap text-[10px] font-black text-[#f5d76e] transition hover:bg-[#d4af37]/20"
                  >
                    COPY {t.referralLink}
                  </button>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-500">
                {myReferralRegistered
                  ? language === "id"
                    ? "Akun referral aktif dan dibaca langsung dari blockchain."
                    : "Referral account is active and read directly from the blockchain."
                  : language === "id"
                    ? "Akun referral belum terdaftar."
                    : "Referral account is not registered."}
              </div>
            </div>

            {/* REFERRER INPUT */}
            <div className="rounded-2xl border border-[#d4af37]/15 bg-white/[0.02] p-5">
              <div className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
                {t.joinReferral}
              </div>

              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {language === "id"
                  ? "Masukkan kode referral. Wallet referrer akan ditemukan otomatis dari blockchain."
                  : "Enter a referral code. The referrer wallet will be found automatically from the blockchain."}
              </p>

              <input
                type="text"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value);
                  setReferralVerified(false);
                  setVerifiedReferrer("");
                }}
                placeholder="Contoh: KGSL-ABC120"
                maxLength={16}
                className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#d4af37]/50"
              />

              <button
                type="button"
                onClick={doVerifyReferral}
                disabled={
                  loading ||
                  !publicKey ||
                  !referralCode.trim()
                }
                className="kgsl-button mt-4 w-full py-3 text-xs"
              >
                {loading
                  ? language === "id"
                    ? "MEMVERIFIKASI..."
                    : "VERIFYING..."
                  : language === "id"
                    ? "VERIFIKASI REFERRAL"
                    : "VERIFY REFERRAL"}
              </button>

              {referralVerified && (
                <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-3">
                  <div className="text-xs font-black text-green-400">
                    ✓ {language === "id"
                      ? "REFERRAL TERVERIFIKASI"
                      : "REFERRAL VERIFIED"}
                  </div>

                  <div className="mt-1 break-all text-[10px] text-zinc-500">
                    {verifiedReferrer}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={doRegisterReferral}
                disabled={
                  loading ||
                  !publicKey ||
                  myReferralRegistered ||
                  (
                    !publicKey.equals(DEV_WALLET) &&
                    !referralVerified
                  )
                }
                className="mt-3 w-full rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 py-3 text-xs font-black text-[#f5d76e] transition hover:bg-[#d4af37]/20 disabled:opacity-30"
              >
                {loading
                  ? language === "id"
                    ? "MEMPROSES..."
                    : "PROCESSING..."
                  : myReferralRegistered
                    ? language === "id"
                      ? "REFERRAL SUDAH TERDAFTAR"
                      : "REFERRAL ALREADY REGISTERED"
                    : publicKey?.equals(DEV_WALLET)
                      ? language === "id"
                        ? "DAFTARKAN REFERRAL ROOT"
                        : "REGISTER ROOT REFERRAL"
                      : language === "id"
                        ? "DAFTARKAN REFERRAL"
                        : "REGISTER REFERRAL"}
              </button>

              <div className="mt-3 text-[10px] leading-4 text-zinc-600">
                {language === "id"
                  ? "Wallet referrer ditemukan otomatis dari Referral Account yang tersimpan di blockchain."
                  : "The referrer wallet is automatically found from the Referral Account stored on the blockchain."}
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            PROTOCOL
        ===================================================== */}
        <section className="grid gap-5 md:grid-cols-3">

          <div className="kgsl-card p-5">
            <div className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
              PROTOCOL
            </div>

            <div className="mt-3 text-sm font-bold">
              Daily Compounding
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Reward dihitung menggunakan mekanisme compounding harian
              sesuai parameter staking.
            </p>
          </div>

          <div className="kgsl-card p-5">
            <div className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
              SECURITY
            </div>

            <div className="mt-3 text-sm font-bold">
              On-Chain Position
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Data posisi staking dibaca langsung dari akun program Solana.
            </p>
          </div>

          <div className="kgsl-card p-5">
            <div className="text-xs font-bold tracking-[0.18em] text-[#d4af37]">
              NETWORK
            </div>

            <div className="mt-3 text-sm font-bold">
              Solana Localnet
            </div>

            <p className="mt-2 break-all text-xs leading-5 text-zinc-500">
              Program: {PROGRAM_ID.toBase58()}
            </p>
          </div>
        </section>

        {/* =====================================================
            CONTRACT DETAILS
        ===================================================== */}
        <details className="kgsl-card group p-5">
          <summary className="cursor-pointer list-none text-sm font-black text-[#f5d76e]">
            SMART CONTRACT DETAILS
            <span className="float-right text-zinc-600 group-open:rotate-180">
              ▼
            </span>
          </summary>

          <div className="mt-5 grid gap-x-6 md:grid-cols-2">
            <InfoDark
              label="PROGRAM ID"
              value={PROGRAM_ID.toBase58()}
            />

            <InfoDark
              label="KGSL MINT"
              value={KGSL_MINT.toBase58()}
            />

            <InfoDark
              label="POOL PDA"
              value={poolPda.toBase58()}
            />

            <InfoDark
              label="POOL KGSL ATA"
              value={getAssociatedTokenAddressSync(
                poolMint,
                poolPda,
                true
              ).toBase58()}
            />

            <InfoDark
              label="REWARD MINT"
              value={rewardMint.toBase58()}
            />

            <InfoDark
              label="STAKE PDA"
              value={stakePda?.toBase58() ?? "-"}
            />
          </div>
        </details>

        <footer className="pb-6 pt-2 text-center text-[10px] text-zinc-700">
          KING SULAIMAN • KGSL STAKING PROTOCOL • SOLANA
        </footer>
      </div>
    </main>
  );
}

/* ============================================================
   COMPONENTS
============================================================ */

function Stat({
  title,
  value,
  suffix,
  language,
  decimals = 6,
}: {
  title: string;
  value: number;
  suffix: string;
  language: "id" | "en";
  decimals?: number;
}) {
  return (
    <div className="kgsl-card p-4 md:p-5">
      <div className="text-[10px] font-bold tracking-[0.15em] text-zinc-500">
        {title}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-black md:text-2xl">
          {value.toLocaleString(
            language === "id" ? "id-ID" : "en-US",
            {
              maximumFractionDigits: decimals,
            }
          )}
        </span>

        <span className="text-xs font-black text-[#d4af37]">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function PositionCard({
  label,
  value,
  gold = false,
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="text-[9px] font-bold tracking-wider text-zinc-600">
        {label}
      </div>

      <div
        className={`mt-2 break-words text-sm font-black ${
          gold ? "text-[#f5d76e]" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function InfoDark({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/10 py-3 md:flex-row md:items-center md:justify-between">
      <span className="text-[10px] font-bold tracking-wider text-zinc-600">
        {label}
      </span>

      <span className="break-all text-right text-xs font-bold text-zinc-300">
        {value}
      </span>
    </div>
  );
}

