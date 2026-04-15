#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"
PTAU_FILE="${ARTIFACTS_DIR}/powersOfTau28_hez_final_12.ptau"
POT_INITIAL="${ARTIFACTS_DIR}/pot12_0000.ptau"
POT_CONTRIB="${ARTIFACTS_DIR}/pot12_0001.ptau"
CIRCOM_BIN="${CIRCOM_BIN:-circom2}"

mkdir -p "${ARTIFACTS_DIR}"

"${CIRCOM_BIN}" "${ROOT_DIR}/qoe_sla.circom" --r1cs --wasm --sym -o "${ARTIFACTS_DIR}"

if [[ ! -f "${PTAU_FILE}" ]]; then
  snarkjs powersoftau new bn128 12 "${POT_INITIAL}" -v
  snarkjs powersoftau contribute "${POT_INITIAL}" "${POT_CONTRIB}" --name="MobCloudX phase1" -v -e="mobcloudx-phase1"
  snarkjs powersoftau prepare phase2 "${POT_CONTRIB}" "${PTAU_FILE}" -v
fi

snarkjs groth16 setup \
  "${ARTIFACTS_DIR}/qoe_sla.r1cs" \
  "${PTAU_FILE}" \
  "${ARTIFACTS_DIR}/qoe_sla_0000.zkey"

snarkjs zkey contribute \
  "${ARTIFACTS_DIR}/qoe_sla_0000.zkey" \
  "${ARTIFACTS_DIR}/qoe_sla_final.zkey" \
  --name="MobCloudX setup contribution" \
  -v \
  -e="mobcloudx-zk"

snarkjs zkey export verificationkey \
  "${ARTIFACTS_DIR}/qoe_sla_final.zkey" \
  "${ARTIFACTS_DIR}/verification_key.json"

echo "Trusted setup artifacts written to ${ARTIFACTS_DIR}"
