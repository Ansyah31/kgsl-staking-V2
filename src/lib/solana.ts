import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "6L1pszERmfG15M3Rw1X872FV87eqPyer4CD2TasUGTgs"
);

export const RPC_URL = "https://api.devnet.solana.com";

export const connection = new Connection(RPC_URL, "confirmed");
