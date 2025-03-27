#!/bin/bash

# Usage check
if [ $# -ne 2 ]; then
    echo "$0: usage ./launch_traceroute.sh <src_grp> <dst_ip>"
    exit 1
fi

# Trap Ctrl+C
trap "exit" SIGINT

# Parameters
src_grp=$1
dst_ip=$2

# Output setup
output_dir="/root/routes/${src_grp}/${dst_ip}"
mkdir -p "$output_dir"
timestamp=$(date "+%Y-%m-%dT%H-%M-%S")
raw_output_file="${output_dir}/traceroutes_${timestamp}.txt"
json_output_file="${output_dir}/traceroutes_${timestamp}.json"

# Step 1: Run traceroute and save raw output
traceroute -i group${src_grp} "${dst_ip}" | tee "$raw_output_file"

# Step 2: Parse hops (skip header) into a temp file
tail -n +2 "$raw_output_file" > /tmp/traceroute_parsed.txt

# Step 3: Start JSON export
{
  echo "{"
  echo "  \"src_grp\": ${src_grp},"
  echo "  \"dst_ip\": \"${dst_ip}\","
  echo "  \"timestamp\": \"${timestamp}\","
  echo "  \"routes\": ["
} > "$json_output_file"

# Step 4: Process lines into JSON objects
awk '
{
  hop=$1
  hostname = "*"
  ip = "*"
  rtt = "null"

  if ($2 == "*") {
    # unreachable hop
  } else {
    hostname = $2
    ip = $3
    gsub("[()]", "", ip)
    for (i = 4; i <= NF; i++) {
      if ($i ~ /^[0-9.]+$/) {
        rtt = $i
        break
      }
    }
  }

  printf "    {\"hop\": %d, \"hostname\": \"%s\", \"ip\": \"%s\", \"rtt_ms\": %s}", hop, hostname, ip, rtt

  if (NR != ENVIRON["TRACEROUTE_HOP_COUNT"])
    printf ","
  printf "\n"
}
' TRACEROUTE_HOP_COUNT=$(wc -l < /tmp/traceroute_parsed.txt) /tmp/traceroute_parsed.txt >> "$json_output_file"

# Step 5: Close JSON structure
echo "  ]" >> "$json_output_file"
echo "}" >> "$json_output_file"

# Clean up
rm /tmp/traceroute_parsed.txt

# Done
echo "Traceroute JSON saved to $json_output_file"


# for hop in `seq 30`
# do
#     echo -e 'Hop '$hop':  \c'
#     nping --interface group_"${src_grp}" --source-ip "${src_grp}".0.199.2 --dest-ip "${dst_ip}" --tr --ttl "${hop}" -c 1 -H --delay 100ms 2> /dev/null | grep RCVD | cut -f 4,7,8,9 -d ' ' | cut -f 2 -d '['
# done
