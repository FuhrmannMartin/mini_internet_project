#!/bin/bash

if [ $# -ne 2 ]; then
    echo "$0: usage ./launch_traceroute.sh <src_grp> <dst_ip>"
    exit 1
fi

trap "exit" SIGINT

src_grp=$1
dst_ip=$2

# Output directory and timestamp
output_dir="/root/${src_grp}/${dst_ip}"
mkdir -p "$output_dir"
timestamp=$(date "+%Y-%m-%dT%H-%M-%S")
json_output_file="${output_dir}/traceroute_${timestamp}.json"
raw_output_file="${output_dir}/traceroute_${timestamp}.txt"

# Run traceroute, show it live, and save raw output
traceroute -i group${src_grp} "${dst_ip}" | tee "$raw_output_file" | tail -n +2 > /tmp/traceroute_parsed.txt

# Build JSON file
echo "[" > "$json_output_file"

awk '
{
  hop=$1
  hostname = "*"
  ip = "*"
  rtt = "null"

  if ($2 == "*") {
    # All stars - unreachable
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

  printf "  {\"hop\": %d, \"hostname\": \"%s\", \"ip\": \"%s\", \"rtt_ms\": %s}", hop, hostname, ip, rtt

  if (NR != ENVIRON["TRACEROUTE_HOP_COUNT"])
    printf ","
  printf "\n"
}
' TRACEROUTE_HOP_COUNT=$(wc -l < /tmp/traceroute_parsed.txt) /tmp/traceroute_parsed.txt >> "$json_output_file"

echo "]" >> "$json_output_file"

# Clean up
rm /tmp/traceroute_parsed.txt

echo "Traceroute JSON saved to $json_output_file"




# for hop in `seq 30`
# do
#     echo -e 'Hop '$hop':  \c'
#     nping --interface group_"${src_grp}" --source-ip "${src_grp}".0.199.2 --dest-ip "${dst_ip}" --tr --ttl "${hop}" -c 1 -H --delay 100ms 2> /dev/null | grep RCVD | cut -f 4,7,8,9 -d ' ' | cut -f 2 -d '['
# done
