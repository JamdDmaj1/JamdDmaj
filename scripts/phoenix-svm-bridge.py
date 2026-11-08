"""In-memory Solana rehearsal. No network client, private files or real sends.

Only the Node parent fetches public read-only chain data. Every transaction
executed here stays inside LiteSVM with fictitious wallet balances. Disabling
signature verification is LOCAL ONLY, to rehearse provider co-signing accounts
without possessing or requesting any provider/user key.
"""
import base64
import json
import sys
from solders.account import Account
from solders.clock import Clock
from solders.litesvm import LiteSVM
from solders.pubkey import Pubkey
from solders.rent import Rent
from solders.transaction import VersionedTransaction
from solders.transaction_metadata import FailedTransactionMetadata

svm = LiteSVM().with_sigverify(False).with_blockhash_check(False)
CLOCK = "SysvarC1ock11111111111111111111111111111111"
RENT = "SysvarRent111111111111111111111111111111111"
RESTART = "SysvarLastRestartS1ot1111111111111111111111"


def b58(data):
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    value = int.from_bytes(data, "big")
    result = ""
    while value:
        value, remainder = divmod(value, 58)
        result = alphabet[remainder] + result
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + result


def encode_account(account, slice_config=None):
    if account is None:
        return None
    data = bytes(account.data)
    size = len(data)
    if slice_config:
        start = slice_config["offset"]
        data = data[start:start + slice_config["length"]]
    return {"owner": str(account.owner), "lamports": account.lamports,
            "executable": account.executable, "rentEpoch": account.rent_epoch,
            "space": size, "data": [base64.b64encode(data).decode(), "base64"]}


def metadata(meta):
    def field(value, name):
        member = getattr(value, name)
        return member() if callable(member) else member

    groups = []
    for index, instructions in enumerate(meta.inner_instructions()):
        if not instructions:
            continue
        group = []
        for inner in instructions:
            ix = field(inner, "instruction")
            group.append({"programIdIndex": field(ix, "program_id_index"),
                          "accounts": list(field(ix, "accounts")), "data": b58(bytes(field(ix, "data"))),
                          "stackHeight": field(inner, "stack_height")})
        groups.append({"index": index, "instructions": group})
    return {"err": None, "logs": meta.logs(), "unitsConsumed": meta.compute_units_consumed(),
            "fee": meta.fee(), "innerInstructions": groups}


def run(command):
    kind = command["kind"]
    if kind == "initialize":
        for program in command["programs"]:
            data = base64.b64decode(program["elfBase64"], validate=True)
            if not data.startswith(b"\x7fELF"):
                raise ValueError("Not an ELF program")
            svm.add_program(Pubkey.from_string(program["address"]), data)
        for row in command["accounts"]:
            address, value = row["address"], row["account"]
            if value is None:
                continue
            data = base64.b64decode(value["data"][0], validate=True)
            if address == CLOCK:
                svm.set_clock(Clock.from_bytes(data))
            elif address == RENT:
                svm.set_rent(Rent.from_bytes(data))
            elif address == RESTART:
                svm.set_last_restart_slot(int.from_bytes(data, "little"))
            else:
                svm.set_account(Pubkey.from_string(address), Account(
                    lamports=value["lamports"], data=data, owner=Pubkey.from_string(value["owner"]),
                    executable=value["executable"], rent_epoch=value.get("rentEpoch", 0)))
        # A fictitious payer, not an airdrop/transfer on a real network.
        svm.set_account(Pubkey.from_string(command["walletAddress"]), Account(
            lamports=2_000_000_000, data=b"", owner=Pubkey.default()))
        return {"initialized": True, "slot": svm.get_clock().slot,
                "blockhash": str(svm.latest_blockhash())}
    if kind == "read":
        return {"context": {"slot": svm.get_clock().slot},
                "value": [encode_account(svm.get_account(Pubkey.from_string(a)), command.get("dataSlice"))
                          for a in command["addresses"]]}
    if kind in ("simulate", "execute-local"):
        tx = VersionedTransaction.from_bytes(base64.b64decode(command["wireBase64"], validate=True))
        result = svm.simulate_transaction(tx) if kind == "simulate" else svm.send_transaction(tx)
        if isinstance(result, FailedTransactionMetadata):
            return {"context": {"slot": svm.get_clock().slot}, "value": {
                **metadata(result.meta()), "err": str(result.err()), "accounts": None}}
        meta = result.meta() if kind == "simulate" else result
        post = dict(result.post_accounts()) if kind == "simulate" else {}
        accounts = [encode_account(post.get(Pubkey.from_string(a)) or svm.get_account(Pubkey.from_string(a)))
                    for a in command.get("addresses", [])]
        return {"context": {"slot": svm.get_clock().slot}, "value": {**metadata(meta), "accounts": accounts}}
    if kind == "set-fictitious-account":
        value = command["account"]
        svm.set_account(Pubkey.from_string(command["address"]), Account(
            lamports=value["lamports"], data=base64.b64decode(value["data"][0], validate=True),
            owner=Pubkey.from_string(value["owner"]), executable=False))
        return {"localOnly": True}
    if kind == "rent":
        return svm.minimum_balance_for_rent_exemption(command["bytes"])
    raise ValueError("Unsupported local VM command")


for line in sys.stdin:
    command = None
    try:
        if len(line) > 100_000_000:
            raise ValueError("Bridge input too large")
        command = json.loads(line)
        reply = {"id": command["id"], "result": run(command)}
    except Exception as error:
        reply = {"id": command.get("id") if isinstance(command, dict) else None,
                 "error": type(error).__name__ + ": " + str(error)[:2000]}
    print(json.dumps(reply, separators=(",", ":")), flush=True)
