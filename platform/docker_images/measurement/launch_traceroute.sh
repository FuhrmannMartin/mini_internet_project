#!/bin/bash

# Check argument count
if [ $# -ne 2 ]; then
    echo "$0: usage ./launch_traceroute.sh <src_grp> <dst_ip>"
    exit 1
fi

# Exit on Ctrl+C
trap "exit" SIGINT

src_grp=$1
dst_ip=$2

# Define output directory: /root/<src_grp>/<dst_ip>/
output_dir="/root/${src_grp}/${dst_ip}"
mkdir -p "$output_dir"

# Generate timestamp for filename (ISO-like format)
timestamp=$(date "+%Y-%m-%dT%H-%M-%S")

# Define full output file path
output_file="${output_dir}/traceroute_${timestamp}.txt"

# Run traceroute and write to the file
{
    echo "Traceroute from group${src_grp} to ${dst_ip}"
    echo "Timestamp: $timestamp"
    echo "---------------------------------------"
    traceroute -i group${src_grp} "${dst_ip}"
} > "$output_file"

# Confirm save location
echo "Traceroute saved to $output_file"


# for hop in `seq 30`
# do
#     echo -e 'Hop '$hop':  \c'
#     nping --interface group_"${src_grp}" --source-ip "${src_grp}".0.199.2 --dest-ip "${dst_ip}" --tr --ttl "${hop}" -c 1 -H --delay 100ms 2> /dev/null | grep RCVD | cut -f 4,7,8,9 -d ' ' | cut -f 2 -d '['
# done
